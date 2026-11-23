import { describe, expect, it } from 'vitest';
import { FinancialCryptoService } from '../financial-crypto.js';

function cryptoHarness(ownerId = 'owner-a', appDataKey?: string) {
  const keys = new Map<number, object>();
  const db = {
    userId: ownerId,
    workspaceId: 'workspace-a',
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith('SELECT key_version,wrapped_key'))
        return [...keys.entries()]
          .sort(([a], [b]) => b - a)
          .map(([key_version, wrapped_key]) => ({ key_version, wrapped_key }));
      if (sql.startsWith('INSERT INTO wallet.financial_data_keys')) {
        keys.set(Number(values[1]), JSON.parse(String(values[2])));
        return [];
      }
      if (sql.startsWith('SELECT wrapped_key'))
        return keys.has(Number(values[1])) ? [{ wrapped_key: keys.get(Number(values[1])) }] : [];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const config = { appDataKey, financialDataKek: Buffer.alloc(32, 7).toString('base64') };
  return { service: new FinancialCryptoService(db as never, config as never), db };
}

describe('financial envelope encryption', () => {
  it('round trips encrypted fields and rejects changed associated data', async () => {
    const { service } = cryptoHarness();
    const sealed = await service.encrypt('workspace-a', 'invoice', 'record-a', { amount: 12345 });
    expect(sealed.data).not.toContain('12345');
    await expect(service.decrypt('workspace-a', 'invoice', 'record-a', sealed)).resolves.toEqual({
      amount: 12345,
    });
    await expect(service.decrypt('workspace-b', 'invoice', 'record-a', sealed)).rejects.toThrow();
  });

  it('encrypts new payloads with the application key and isolates workspaces', async () => {
    const { service } = cryptoHarness('owner-a', Buffer.alloc(32, 8).toString('base64'));
    const envelope = await service.encrypt('workspace-a', 'invoice', 'record-a', 12345);
    expect(envelope.v).toBe(2);
    await expect(service.decrypt('workspace-a', 'invoice', 'record-a', envelope)).resolves.toBe(
      12345,
    );
    await expect(service.decrypt('workspace-b', 'invoice', 'record-a', envelope)).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const { service } = cryptoHarness();
    const sealed = await service.encrypt('workspace-a', 'invoice', 'record-a', {
      secret: 'private',
    });
    const tampered = { ...sealed, data: Buffer.from('changed').toString('base64') };
    await expect(service.decrypt('workspace-a', 'invoice', 'record-a', tampered)).rejects.toThrow();
  });
});
