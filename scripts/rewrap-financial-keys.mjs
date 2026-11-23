import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

function key(name) {
  const bytes = Buffer.from(process.env[name]?.trim() ?? '', 'base64');
  if (bytes.length !== 32) throw new Error(`${name} deve conter 32 bytes em Base64.`);
  return bytes;
}

const next = key('APP_DATA_KEY_BASE64');
const previous = key('FINANCIAL_DATA_KEK_BASE64');
if (next.equals(previous)) throw new Error('Configure uma chave nova diferente da anterior.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL administrativa obrigatória.');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 10000,
  ssl: {
    rejectUnauthorized: true,
    ca: await readFile(
      process.env.DATABASE_CA_FILE || 'infra/certificates/supabase-root-2021.crt',
      'utf8',
    ),
  },
});
try {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows } = await db.query(
      "SELECT user_id,key_version,wrapped_key FROM wallet.financial_data_keys WHERE wrapped_key->>'master' IS NULL FOR UPDATE",
    );
    for (const row of rows) {
      const aad = `plannedwallet:dek:${row.user_id}:${row.key_version}`;
      const old = row.wrapped_key;
      const decipher = createDecipheriv('aes-256-gcm', previous, Buffer.from(old.iv, 'base64'));
      decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(Buffer.from(old.tag, 'base64'));
      const raw = Buffer.concat([
        decipher.update(Buffer.from(old.data, 'base64')),
        decipher.final(),
      ]);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', next, iv);
      cipher.setAAD(Buffer.from(`${aad}:app`));
      const data = Buffer.concat([cipher.update(raw), cipher.final()]);
      await db.query(
        'UPDATE wallet.financial_data_keys SET wrapped_key=$3::jsonb WHERE user_id=$1 AND key_version=$2',
        [
          row.user_id,
          row.key_version,
          JSON.stringify({
            master: 'app',
            iv: iv.toString('base64'),
            data: data.toString('base64'),
            tag: cipher.getAuthTag().toString('base64'),
          }),
        ],
      );
    }
    const apply = process.argv.includes('--apply');
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(`${apply ? 'Chaves migradas' : 'Chaves verificadas em simulação'}: ${rows.length}`);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
} finally {
  await pool.end();
}
