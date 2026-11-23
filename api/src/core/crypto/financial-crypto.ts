import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/index.js';
import { Configuration } from '../config/index.js';

type Envelope = { v: 1 | 2; keyVersion: number; iv: string; tag: string; data: string };
type WrappedKey = { master?: 'app'; iv: string; tag: string; data: string };

function seal(key: Buffer, plaintext: Buffer, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}
function open(key: Buffer, value: WrappedKey, aad: string) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]);
}

@Injectable()
export class FinancialCryptoService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(Configuration) private readonly config: Configuration,
  ) {}

  private kek() {
    const encoded = this.config.financialDataKek;
    const key = encoded ? Buffer.from(encoded, 'base64') : Buffer.alloc(0);
    if (key.length !== 32) {
      throw new ServiceUnavailableException(
        'A criptografia financeira não está configurada. Defina FINANCIAL_DATA_KEK_BASE64 com uma chave aleatória de 32 bytes em Base64.',
      );
    }
    return key;
  }

  private unwrap(value: WrappedKey, owner: string, version: number) {
    const appKey = value.master === 'app';
    return open(
      appKey ? this.appKey() : this.kek(),
      value,
      `plannedwallet:dek:${owner}:${version}${appKey ? ':app' : ''}`,
    );
  }

  private async dek() {
    const owner = this.db.userId;
    const existing = await this.db.query<{ key_version: number; wrapped_key: WrappedKey }>(
      'SELECT key_version,wrapped_key FROM wallet.financial_data_keys WHERE user_id=$1 AND retired_at IS NULL ORDER BY key_version DESC LIMIT 1',
      [owner],
    );
    if (existing[0]) {
      const row = existing[0];
      return {
        key: this.unwrap(row.wrapped_key, owner, row.key_version),
        version: row.key_version,
      };
    }
    const raw = randomBytes(32);
    const version = 1;
    const wrapped = this.config.appDataKey
      ? { master: 'app', ...seal(this.appKey(), raw, `plannedwallet:dek:${owner}:${version}:app`) }
      : seal(this.kek(), raw, `plannedwallet:dek:${owner}:${version}`);
    await this.db.query(
      'INSERT INTO wallet.financial_data_keys(user_id,key_version,wrapped_key) VALUES($1,$2,$3::jsonb) ON CONFLICT(user_id,key_version) DO NOTHING',
      [owner, version, JSON.stringify(wrapped)],
    );
    const winner = await this.db.query<{ key_version: number; wrapped_key: WrappedKey }>(
      'SELECT key_version,wrapped_key FROM wallet.financial_data_keys WHERE user_id=$1 AND retired_at IS NULL ORDER BY key_version DESC LIMIT 1',
      [owner],
    );
    if (!winner[0]) throw new Error('Financial data key could not be initialized.');
    return {
      key: this.unwrap(winner[0].wrapped_key, owner, winner[0].key_version),
      version: winner[0].key_version,
    };
  }

  private appKey() {
    const key = Buffer.from(this.config.appDataKey ?? '', 'base64');
    if (key.length !== 32)
      throw new ServiceUnavailableException(
        'Configure APP_DATA_KEY_BASE64 com 32 bytes aleatórios em Base64.',
      );
    return key;
  }

  private workspaceKey(workspaceId: string) {
    const key = this.appKey();
    const scope = JSON.stringify([this.db.userId, workspaceId]);
    return Buffer.from(
      hkdfSync('sha256', key, Buffer.from(scope), 'plannedwallet:workspace-data:v2', 32),
    );
  }

  async encrypt<T>(
    workspaceId: string,
    entity: string,
    recordId: string,
    value: T,
  ): Promise<Envelope> {
    const plaintext = Buffer.from(JSON.stringify(value));
    const scope = `${this.db.userId}:${workspaceId}:${entity}:${recordId}`;
    if (this.config.appDataKey)
      return {
        v: 2,
        keyVersion: 1,
        ...seal(this.workspaceKey(workspaceId), plaintext, `plannedwallet:data:v2:${scope}`),
      };
    const { key, version } = await this.dek();
    return { v: 1, keyVersion: version, ...seal(key, plaintext, `plannedwallet:data:v1:${scope}`) };
  }

  async decrypt<T>(
    workspaceId: string,
    entity: string,
    recordId: string,
    envelope: Envelope,
  ): Promise<T> {
    if ((envelope.v !== 1 && envelope.v !== 2) || !Number.isInteger(envelope.keyVersion))
      throw new Error('Unsupported encrypted payload.');
    const owner = this.db.userId;
    if (envelope.v === 2) {
      if (envelope.keyVersion !== 1) throw new Error('Unsupported application key version.');
      const aad = `plannedwallet:data:v2:${owner}:${workspaceId}:${entity}:${recordId}`;
      return JSON.parse(open(this.workspaceKey(workspaceId), envelope, aad).toString('utf8')) as T;
    }
    const rows = await this.db.query<{ wrapped_key: WrappedKey }>(
      'SELECT wrapped_key FROM wallet.financial_data_keys WHERE user_id=$1 AND key_version=$2',
      [owner, envelope.keyVersion],
    );
    if (!rows[0]) throw new Error('Financial data key is unavailable.');
    const dek = this.unwrap(rows[0].wrapped_key, owner, envelope.keyVersion);
    const aad = `plannedwallet:data:v${envelope.v}:${owner}:${workspaceId}:${entity}:${recordId}`;
    return JSON.parse(open(dek, envelope, aad).toString('utf8')) as T;
  }

  async fingerprint(value: string) {
    const { key } = await this.dek();
    const workspace = this.db.workspaceId;
    const blindIndexKey = Buffer.from(
      hkdfSync('sha256', key, Buffer.from(this.db.userId), 'plannedwallet:invoice-dedupe:v1', 32),
    );
    return createHmac('sha256', blindIndexKey).update(`${workspace}:${value}`).digest('hex');
  }
}
