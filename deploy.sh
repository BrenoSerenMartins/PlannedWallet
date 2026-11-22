#!/usr/bin/env bash
set -Eeuo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ $# -gt 1 || ${1:-} == --help ]]; then
  printf 'Uso: ./deploy.sh "Mensagem do commit"\n'
  exit 0
fi

log_dir=$(mktemp -d "${TMPDIR:-/tmp}/plannedwallet-deploy.XXXXXX")
run() {
  local label=$1 log
  shift
  log=$(mktemp "$log_dir/step.XXXXXX")
  if "$@" >"$log" 2>&1; then
    printf '%s --- OK\n' "$label"
  else
    printf '%s --- FALHOU (%s)\n' "$label" "$log" >&2
    tail -n 16 "$log" >&2
    exit 1
  fi
}

if [[ $(git branch --show-current) != main ]]; then
  printf 'Branch --- FALHOU: execute na main.\n' >&2
  exit 1
fi

before=$(git rev-parse HEAD)
local_changes=$(git status --porcelain --untracked-files=normal)
run 'Pull da main' git pull --ff-only origin main
after=$(git rev-parse HEAD)

if [[ $before != "$after" && -n $local_changes ]]; then
  printf 'Revisão --- PENDENTE: a main avançou de %.8s para %.8s. Revise as mudanças locais contra a nova base antes de rodar novamente.\n' "$before" "$after"
  exit 2
fi

if [[ -n $(git status --porcelain --untracked-files=normal) && -z ${1:-} ]]; then
  printf 'Commit --- FALHOU: informe a mensagem em ./deploy.sh "mensagem".\n' >&2
  exit 1
fi

if [[ -z $(git status --porcelain --untracked-files=normal) && $(git rev-parse origin/main) == "$after" ]]; then
  printf 'Deploy --- Sem mudanças locais para publicar.\n'
  exit 0
fi

run 'Diff' git diff --check HEAD
run 'Contratos da API' npm run contracts
run 'Limites entre módulos' npm run arch:boundaries
run 'Build e typecheck' npm run build
run 'Verificação de segredos' node scripts/check-secrets.mjs

migration_changes=$(
  git diff --name-only origin/main -- supabase/migrations
  git ls-files --others --exclude-standard -- supabase/migrations
  git diff --name-only "$before" "$after" -- supabase/migrations
)
if [[ -n $migration_changes ]]; then
  run 'Migrações' npm run db:migrate
else
  printf 'Migrações --- Sem alterações\n'
fi

if [[ -n $(git status --porcelain --untracked-files=normal) ]]; then
  run 'Preparar commit' git add -A
  run 'Diff do commit' git diff --cached --check
  run 'Commit' git commit -m "${1:-Atualizar contratos do PlannedWallet}"
fi
run 'Push da main' git push origin main

printf 'Commit publicado --- %s\n' "$(git rev-parse --short HEAD)"
health_url=${PLANNEDWALLET_READY_URL:-https://plannedwallet.onrender.com/ready}
if curl --silent --fail --max-time 10 "$health_url" >"$log_dir/render-ready.log"; then
  printf 'Render /ready --- OK (saúde do serviço, versão ainda não confirmada)\n'
else
  printf 'Render /ready --- PENDENTE (push concluído)\n'
fi
