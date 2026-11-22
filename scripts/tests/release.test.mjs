import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { verifyProduction, productionBaseline } from '../verify-production.mjs';

const sha = 'a'.repeat(40);
const deployment = { id: 1, sha, environment: 'main - plannedwallet-pilot' };
function production(state, status = 200, deployments = [deployment]) {
  const paths = [];
  return {
    paths,
    args: {
      sha,
      attempts: 2,
      api: async (path) => (path.includes('/statuses') ? [{ state }] : deployments),
      fetchUrl: async (url) => {
        paths.push(url);
        return { status };
      },
      sleep: async () => {},
    },
  };
}
test('requires deployment success for exact SHA and both health probes', async () => {
  const fixture = production('success');
  await verifyProduction(fixture.args);
  assert.equal(fixture.paths.length, 2);
  for (const deployments of [
    [{ ...deployment, sha: 'b'.repeat(40) }],
    [{ ...deployment, environment: 'preview' }],
  ]) {
    await assert.rejects(verifyProduction(production('success', 200, deployments).args), /Prazo/);
  }
});
test('rejects failed deployment, unhealthy production and pending timeout', async () => {
  await assert.rejects(verifyProduction(production('failure').args), /recusou/);
  await assert.rejects(verifyProduction(production('success', 503).args), /indisponível/);
  await assert.rejects(verifyProduction(production('in_progress').args), /Prazo/);
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'plannedwallet-release-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, 'origin.git');
  const work = join(root, 'work');
  const bin = join(root, 'bin');
  mkdirSync(work);
  mkdirSync(bin);
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: work,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '--bare', remote);
  git('init', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Release test');
  git('remote', 'add', 'origin', remote);
  writeFileSync(join(work, '.gitignore'), '.verification/\n');
  mkdirSync(join(work, 'knowledge'));
  writeFileSync(join(work, 'knowledge', 'release.md'), 'Initial\n');
  copyFileSync(new URL('../../deploy.sh', import.meta.url), join(work, 'deploy.sh'));
  git('add', '.');
  git('commit', '-m', 'Initial');
  git('push', '-u', 'origin', 'main');
  const base = git('rev-parse', 'HEAD');
  // Mock only external validation/database/hosting commands; git remains real.
  for (const command of ['npm', 'node', 'gh']) {
    writeFileSync(
      join(bin, command),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\nif [ "$*" = "scripts/verify-production.mjs --baseline" ]; then printf "%s\\n" "$PRODUCTION_BASE"; fi\nif [ "$*" = "run db:migrate" ] && [ "${FAIL_MIGRATION:-}" = 1 ]; then exit 1; fi\n',
      { mode: 0o700 },
    );
  }
  const calls = join(root, 'calls');
  const run = (args, extra = {}) =>
    spawnSync('bash', ['deploy.sh', ...args], {
      cwd: work,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        CALLS: calls,
        PRODUCTION_BASE: base,
        ...extra,
      },
    });
  const stage = (migration = true) => {
    writeFileSync(join(work, 'knowledge', 'release.md'), 'Reviewed release\n');
    git('add', 'knowledge/release.md');
    if (migration) {
      mkdirSync(join(work, 'supabase', 'migrations'), { recursive: true });
      writeFileSync(join(work, 'supabase', 'migrations', 'new.sql'), 'SELECT 1;\n');
      git('add', 'supabase/migrations/new.sql');
    }
  };
  return { root, remote, work, git, base, run, calls, stage };
}
test('review mismatch and missing knowledge stop before checks or database', (t) => {
  const f = fixture(t);
  assert.equal(f.run(['Release', `--reviewed=${'b'.repeat(40)}`]).status, 2);
  assert.equal(f.run(['Release', `--reviewed=${f.base}`]).status, 2);
  assert.equal(f.git('rev-parse', 'origin/main'), f.base);
});
test('migration failure prevents commit and push', (t) => {
  const f = fixture(t);
  f.stage();
  const result = f.run(['Release', `--reviewed=${f.base}`], { FAIL_MIGRATION: '1' });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Migrations --- FALHOU/);
  assert.equal(f.git('rev-parse', 'HEAD'), f.base);
  assert.equal(f.git('rev-parse', 'origin/main'), f.base);
});
test('successful release checks every stage, commits knowledge and verifies pushed SHA', (t) => {
  const f = fixture(t);
  f.stage();
  const result = f.run(['Release', `--reviewed=${f.base}`]);
  assert.equal(result.status, 0, result.stderr);
  const head = f.git('rev-parse', 'HEAD');
  assert.notEqual(head, f.base);
  assert.equal(f.git('rev-parse', 'origin/main'), head);
  assert.match(result.stdout, /Deploy completo --- OK/);
  const calls = readFileSync(f.calls, 'utf8');
  assert.match(calls, /--only=unit/);
  assert.match(calls, /--max-failures=1/);
  assert.match(calls, /run db:migrate/);
  assert.ok(calls.includes(`scripts/verify-production.mjs ${head}`));
});
test('upstream advancement invalidates prior semantic review', (t) => {
  const f = fixture(t);
  const other = join(f.root, 'other');
  execFileSync('git', ['clone', '--branch', 'main', f.remote, other], { stdio: 'ignore' });
  const git = (...args) => execFileSync('git', args, { cwd: other, stdio: 'ignore' });
  git('config', 'user.email', 'other@example.invalid');
  git('config', 'user.name', 'Other');
  writeFileSync(join(other, 'new-feature.txt'), 'Upstream feature\n');
  git('add', '.');
  git('commit', '-m', 'Upstream');
  git('push');
  f.stage();
  const result = f.run(['Release', `--reviewed=${f.base}`]);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Revisão --- PENDENTE/);
  assert.equal(readFileSync(join(f.work, 'new-feature.txt'), 'utf8'), 'Upstream feature\n');
});

test('does not accept an older successful deployment after a newer release', async () => {
  const newer = { ...deployment, id: 2, sha: 'b'.repeat(40) };
  await assert.rejects(
    verifyProduction(production('success', 200, [newer, deployment]).args),
    /substituiu/,
  );
});
test('merge conflicts stop without discarding either side', (t) => {
  const f = fixture(t);
  f.stage();
  f.git('commit', '-m', 'Local knowledge');
  f.git('checkout', '-b', 'conflicting', f.base);
  writeFileSync(join(f.work, 'knowledge', 'release.md'), 'Conflicting knowledge\n');
  f.git('add', '.');
  f.git('commit', '-m', 'Conflicting knowledge');
  f.git('checkout', 'main');
  assert.throws(() => f.git('merge', 'conflicting'));
  const result = f.run(['Release', `--reviewed=${f.base}`]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Conflitos --- PENDENTE/);
  assert.match(readFileSync(join(f.work, 'knowledge', 'release.md'), 'utf8'), /<<<<<<< HEAD/);
});

test('identical schema to verified production does not require a database connection', (t) => {
  const f = fixture(t);
  f.stage(false);
  const result = f.run(['Release', `--reviewed=${f.base}`], { FAIL_MIGRATION: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sem mudanças de schema/);
  assert.ok(!readFileSync(f.calls, 'utf8').includes('run db:migrate'));
});
test('unknown production baseline still requires database verification', (t) => {
  const f = fixture(t);
  f.stage(false);
  const result = f.run(['Release', `--reviewed=${f.base}`], {
    PRODUCTION_BASE: '',
    FAIL_MIGRATION: '1',
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Migrations --- FALHOU/);
});
test('baseline requires exact production environment, successful deployment and readiness', async () => {
  const fixture = production('success');
  assert.equal(await productionBaseline(fixture.args), sha);
  await assert.rejects(productionBaseline(production('success', 503).args), /saudável/);
  await assert.rejects(productionBaseline(production('in_progress').args), /Nenhuma versão/);
});
