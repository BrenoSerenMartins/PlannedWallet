#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ ${1:-} == --help || $# -gt 2 ]]; then
  printf 'Uso: ./deploy.sh --prepare | ./deploy.sh "Mensagem" --reviewed=SHA_DA_MAIN\n'
  exit 0
fi
mkdir -p .verification
export npm_config_cache="${npm_config_cache:-$PWD/.verification/npm-cache}"
log_dir=$(mktemp -d .verification/deploy.XXXXXX)
run() {
  local label=$1 log="$log_dir/$1.log"
  shift
  if "$@" >"$log" 2>&1; then
    printf '%s --- OK\n' "$label"
  else
    printf '%s --- FALHOU. Detalhes: %s\n' "$label" "$log" >&2
    exit 1
  fi
}
fail() { printf '%s --- PENDENTE: %s\n' "$1" "$2" >&2; exit 2; }
[[ $(git branch --show-current) == main ]] || fail Branch 'Execute na main.'
[[ ! -e $(git rev-parse --git-path MERGE_HEAD) && ! -d $(git rev-parse --git-path rebase-merge) && ! -d $(git rev-parse --git-path rebase-apply) ]] || fail Conflitos 'Resolva o merge/rebase e revise o resultado antes de continuar.'

before=$(git rev-parse HEAD)
run Pull git pull --ff-only origin main
base=$(git rev-parse origin/main)
{
  printf 'Main revisada: %s\nBase anterior: %s\n' "$base" "$before"
  git log --oneline "$before..$base"
  git diff "$before" "$base" -- knowledge/
  git diff "$base"
  git diff "$base" -- knowledge/
  git ls-files --others --exclude-standard
} > "$log_dir/review.txt"
if [[ ${1:-} == --prepare ]]; then
  printf 'Revisão --- PENDENTE: leia knowledge/, diferenças e %s/review.txt; atualize a documentação e prepare explicitamente os arquivos com git add.\n' "$log_dir"
  printf 'Após revisar: ./deploy.sh "Mensagem" --reviewed=%s\n' "$base"
  exit 0
fi
[[ ${2:-} == "--reviewed=$base" ]] || fail Revisão "Execute --prepare e revise a main $base antes de continuar."
[[ -n ${1:-} ]] || fail Commit 'Informe uma mensagem.'
[[ -z $(git diff --name-only) && -z $(git ls-files --others --exclude-standard) ]] || fail Arquivos 'Prepare somente os arquivos revisados com git add (nenhum arquivo será adicionado automaticamente).'
# Include knowledge in this release, whether staged or already committed locally.
if ! { git diff --cached --name-only; git diff --name-only "$base" HEAD; } | grep -q '^knowledge/'; then
  fail Knowledge 'Atualize e inclua knowledge/ no commit da publicação.'
fi
printf 'Revisão e knowledge --- OK\n'
run Diff git diff --cached --check
run Autenticacao gh api user --silent
# Never infer the deployed schema from origin/main, which may not be live yet.
production=''
if node scripts/verify-production.mjs --baseline > "$log_dir/production.log" 2>&1; then
  production=$(cat "$log_dir/production.log")
  if [[ ! $production =~ ^[a-f0-9]{40}$ ]] || ! git cat-file -e "$production^{commit}" 2>/dev/null; then
    production=''
  fi
fi
printf 'Versão publicada --- OK (%s)\n' "${production:-verificação de banco obrigatória}"

run Automacao node --test scripts/tests/release.test.mjs
run Dependencias npm ci --no-audit --no-fund
run Contratos npm run contracts:check
for stage in lint types boundaries unit build; do
  run "$stage" node scripts/check-quiet.mjs "--only=$stage"
done
run secrets node scripts/check-secrets.mjs
run browser npm run test:e2e -- --fully-parallel --workers=2 --max-failures=1 --timeout=90000 --reporter=line
# A check must not silently change the reviewed/staged tree.
[[ -z $(git diff --name-only) && -z $(git ls-files --others --exclude-standard) ]] || fail Arquivos 'Uma validação alterou arquivos; revise e prepare novamente.'
run Atualidade git fetch origin main
[[ $(git rev-parse origin/main) == "$base" ]] || fail Atualidade 'A main avançou durante os testes. Faça --prepare, integre e revise novamente.'
# Identical SQL to a healthy deployed commit requires no migration for this release.
# Unknown baseline or any SQL difference must use the database ledger; never skip failures.
if [[ -n $production ]] && git diff --quiet "$production" -- supabase/migrations scripts/migrate.mjs; then
  printf 'Migrations --- OK (sem mudanças de schema desde a versão publicada)\n'
else
  run Migrations npm run db:migrate
fi
if ! git diff --cached --quiet; then
  run Commit git commit -m "$1"
else
  printf 'Commit existente --- OK\n'
fi
sha=$(git rev-parse HEAD)
run Push git push origin main
run Render node scripts/verify-production.mjs "$sha"
printf 'Deploy completo --- OK (%s)\n' "$sha"
