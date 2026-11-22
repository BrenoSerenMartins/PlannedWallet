import { cp, mkdir } from 'node:fs/promises';
const target = 'dist/core/financial-files';
await mkdir(target, { recursive: true });
await cp('src/core/financial-files/pdf-worker.mjs', target + '/pdf-worker.mjs');

await mkdir('dist/modules/imports/parsers/files', { recursive: true });
for (const file of ['tabular-worker.mjs', 'read-tabular-file.mjs'])
  await cp(
    'src/modules/imports/parsers/files/' + file,
    'dist/modules/imports/parsers/files/' + file,
  );
