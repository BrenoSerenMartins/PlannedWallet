import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  return {
    plugins: [
      react(),
      {
        name: 'plannedwallet-pwa-build-version',
        apply: 'build',
        async writeBundle(options, bundle) {
          if (!options.dir) return;
          const path = join(options.dir, 'sw.js');
          const worker = await readFile(path, 'utf8');
          const hash = createHash('sha256').update(worker);
          for (const name of Object.keys(bundle).sort()) {
            const file = bundle[name];
            hash.update(name).update(file.type === 'chunk' ? file.code : file.source);
          }
          await writeFile(
            path,
            worker.replace('__PLANNEDWALLET_BUILD__', hash.digest('hex').slice(0, 16)),
          );
        },
      },
    ],
    server: {
      port: 5173,
      proxy: {
        '/v1': 'http://127.0.0.1:8083',
        '/health': 'http://127.0.0.1:8083',
        '/ready': 'http://127.0.0.1:8083',
      },
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        (env.SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim(),
      ),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        (env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim(),
      ),
    },
  };
});
