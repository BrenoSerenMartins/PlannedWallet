import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const stages = [
  ['lint', ['run', 'lint']],
  ['types', ['run', 'typecheck']],
  ['boundaries', ['run', 'arch:boundaries']],
  ['unit', ['test', '--', '--maxWorkers=1', '--reporter=json']],
  ['build', ['run', 'build']],
  ['secrets', ['exec', '--', 'node', 'scripts/check-secrets.mjs']],
  ['browser', ['run', 'test:e2e', '--', '--reporter=json']],
];
if (args.includes('--help')) {
  console.log(
    'npm run check:quiet [-- --only=lint,types,unit,build,browser --last-failed --grep=texto]',
  );
  console.log(
    'Sem opções: todas as verificações, em sequência. --last-failed limita apenas o navegador.',
  );
  process.exit(0);
}
const only = args
  .find((arg) => arg.startsWith('--only='))
  ?.slice(7)
  .split(',');
const invalid = args.filter(
  (arg) =>
    !['--last-failed'].includes(arg) && !arg.startsWith('--only=') && !arg.startsWith('--grep='),
);
if (invalid.length || only?.some((name) => !stages.some(([stage]) => stage === name))) {
  console.error('Opção inválida. Consulte npm run check:quiet -- --help.');
  process.exit(2);
}
const folder = resolve(root, '.verification', new Date().toISOString().replaceAll(':', '-'));
await mkdir(folder, { recursive: true });
const clean = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');
const results = [];
let child;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    child?.kill(signal);
    process.exitCode = 130;
  });
}
for (const [name, command] of stages) {
  if (only && !only.includes(name)) continue;
  if (process.exitCode === 130) break;
  const log = resolve(folder, `${name}.log`);
  const report = resolve(folder, `${name}.json`);
  const argv = [...command];
  if (name === 'unit') argv.push(`--outputFile=${report}`);
  if (name === 'browser') {
    if (args.includes('--last-failed')) argv.push('--last-failed');
    const grep = args.find((arg) => arg.startsWith('--grep='));
    if (grep) argv.push('--grep', grep.slice(7));
  }
  const stream = createWriteStream(log);
  const started = Date.now();
  const outcome = await new Promise((done) => {
    child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', argv, {
      cwd: root,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', PLAYWRIGHT_JSON_OUTPUT_FILE: report },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(stream, { end: false });
    child.stderr.pipe(stream, { end: false });
    child.once('error', (error) => {
      stream.write(error.message);
      done({ code: 1 });
    });
    child.once('close', (code, signal) => done({ code: code ?? 1, signal }));
  });
  stream.end();
  await finished(stream);
  const errors = [];
  if (outcome.code !== 0) {
    try {
      const data = JSON.parse(await readFile(report, 'utf8'));
      if (name === 'unit') {
        for (const suite of data.testResults ?? []) {
          const failed = (suite.assertionResults ?? []).filter((test) => test.status === 'failed');
          for (const test of failed)
            errors.push(`${test.fullName}\n${test.failureMessages.join('\n')}`);
          if (!failed.length && suite.status === 'failed')
            errors.push(`${suite.name}\n${suite.message ?? ''}`);
        }
      } else {
        const visit = (suite) => {
          for (const spec of suite.specs ?? []) {
            for (const test of spec.tests ?? []) {
              if (['expected', 'skipped', 'flaky'].includes(test.status)) continue;
              errors.push(
                `${spec.file}:${spec.line} ${spec.title}\n${test.results
                  .flatMap((result) => result.errors ?? [])
                  .map((error) => error.message ?? error.value ?? '')
                  .join('\n')}`,
              );
            }
          }
          for (const nested of suite.suites ?? []) visit(nested);
        };
        visit(data);
        for (const error of data.errors ?? [])
          errors.push(error.message ?? error.value ?? String(error));
      }
    } catch {
      /* A failed command may not produce a structured report. */
    }
    if (!errors.length)
      errors.push((await readFile(log, 'utf8')).trim().split('\n').slice(-35).join('\n'));
  }
  results.push({
    name,
    ...outcome,
    seconds: Math.round((Date.now() - started) / 1000),
    log,
    report,
    errors: errors.map(clean),
  });
}
const failed = results.filter((result) => result.code !== 0);
const summary = { ok: !failed.length && process.exitCode !== 130, results };
await writeFile(resolve(folder, 'summary.json'), JSON.stringify(summary, null, 2));
await writeFile(
  resolve(root, '.verification', 'latest.json'),
  JSON.stringify({ folder, ...summary }, null, 2),
);
console.log(`${results.length - failed.length}/${results.length} etapas OK. Logs: ${folder}`);
let shown = 0;
for (const result of failed) {
  console.error(`\n${result.name}: ${result.errors.length} erro(s).`);
  for (const error of result.errors) {
    if (shown++ >= 12) break;
    const lines = error.split('\n').filter((line) => line.trim());
    console.error(lines.slice(0, 9).join('\n'));
    if (lines.length > 9) console.error(`… detalhes em ${result.log}`);
  }
}
if (failed.reduce((count, result) => count + result.errors.length, 0) > 12)
  console.error('Demais erros estão em summary.json.');
process.exitCode = process.exitCode === 130 ? 130 : failed.length ? 1 : 0;
