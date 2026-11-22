import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/index.js';
import { FinancialCryptoService } from '../../../core/crypto/financial-crypto.js';

@Injectable()
export class CardInvoiceImportsRepository {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(FinancialCryptoService) private readonly crypto: FinancialCryptoService,
  ) {}
  async save(
    id: string,
    cardId: string,
    month: string,
    sourceName: string,
    fingerprint: string,
    payload: unknown,
  ) {
    const ciphertext = await this.crypto.encrypt(
      this.db.workspaceId,
      'card_invoice_imports.payload',
      id,
      payload,
    );
    const rows = await this.db.query<{
      id: string;
      payload_ciphertext: object;
      status: string;
      version: number;
      bill_month: string;
      source_name: string;
    }>(
      `INSERT INTO wallet.card_invoice_imports(id,user_id,workspace_id,card_id,bill_month,source_name,fingerprint,payload_ciphertext)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT(user_id,workspace_id,card_id,fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint
       RETURNING id,payload_ciphertext,status,version,bill_month,source_name`,
      [
        id,
        this.db.userId,
        this.db.workspaceId,
        cardId,
        month,
        sourceName,
        fingerprint,
        JSON.stringify(ciphertext),
      ],
    );
    return this.present(rows[0]);
  }
  async get(id: string, lock = false) {
    const rows = await this.db.query<{
      id: string;
      card_id: string;
      payload_ciphertext: object;
      status: string;
      version: number;
      bill_month: string;
      source_name: string;
      created_at: string;
    }>(
      'SELECT id,card_id,payload_ciphertext,status,version,bill_month,source_name,created_at FROM wallet.card_invoice_imports WHERE user_id=$1 AND workspace_id=$2 AND id=$3' +
        (lock ? ' FOR UPDATE' : ''),
      [this.db.userId, this.db.workspaceId, id],
    );
    if (!rows[0]) return null;
    return {
      ...rows[0],
      payload: await this.crypto.decrypt(
        this.db.workspaceId,
        'card_invoice_imports.payload',
        rows[0].id,
        rows[0].payload_ciphertext as never,
      ),
    };
  }
  async refreshReview(id: string, version: number, payload: unknown, month: string) {
    const ciphertext = await this.crypto.encrypt(
      this.db.workspaceId,
      'card_invoice_imports.payload',
      id,
      payload,
    );
    await this.db.query(
      "UPDATE wallet.card_invoice_imports SET payload_ciphertext=$4::jsonb, bill_month=$6, status='review', version=version+1 WHERE user_id=$1 AND workspace_id=$2 AND id=$3 AND status IN ('review','superseded') AND version=$5",
      [this.db.userId, this.db.workspaceId, id, JSON.stringify(ciphertext), version, month],
    );
  }

  async confirmedForMonth(cardId: string, month: string) {
    const rows = await this.db.query(
      "SELECT id,bill_month FROM wallet.card_invoice_imports WHERE user_id=$1 AND workspace_id=$2 AND card_id=$3 AND bill_month=$4 AND status='confirmed'",
      [this.db.userId, this.db.workspaceId, cardId, month],
    );
    return rows[0] ? { id: String(rows[0].id), billMonth: String(rows[0].bill_month) } : null;
  }

  async institutionCards(institution: string) {
    const rows = await this.db.query<{ id: string; card_id: string; payload_ciphertext: object }>(
      "SELECT id,card_id,payload_ciphertext FROM wallet.card_invoice_imports WHERE user_id=$1 AND workspace_id=$2 AND status='confirmed' ORDER BY confirmed_at DESC LIMIT 200",
      [this.db.userId, this.db.workspaceId],
    );
    const identities = new Map<string, Set<string>>();
    for (const row of rows) {
      const payload = (await this.crypto.decrypt(
        this.db.workspaceId,
        'card_invoice_imports.payload',
        row.id,
        row.payload_ciphertext as never,
      )) as { parsed?: { institution?: string } };
      if (!payload.parsed?.institution) continue;
      const banks = identities.get(row.card_id) ?? new Set<string>();
      banks.add(payload.parsed.institution);
      identities.set(row.card_id, banks);
    }
    return [...identities]
      .filter(([, banks]) => banks.size === 1 && banks.has(institution))
      .map(([id]) => id);
  }

  async supersedeFrom(cardId: string, month: string) {
    await this.db.query(
      "UPDATE wallet.card_invoice_imports SET status='superseded', version=version+1 WHERE user_id=$1 AND workspace_id=$2 AND card_id=$3 AND bill_month >= $4 AND status='confirmed'",
      [this.db.userId, this.db.workspaceId, cardId, month],
    );
  }

  async confirm(id: string) {
    await this.db.query(
      "UPDATE wallet.card_invoice_imports SET status='confirmed', version=version+1, confirmed_at=now() WHERE user_id=$1 AND workspace_id=$2 AND id=$3",
      [this.db.userId, this.db.workspaceId, id],
    );
  }

  private async present(row: {
    id: string;
    payload_ciphertext: object;
    status: string;
    version: number;
    bill_month: string;
    source_name: string;
  }) {
    return {
      id: row.id,
      status: row.status,
      version: row.version,
      billMonth: row.bill_month,
      sourceName: row.source_name,
      payload: await this.crypto.decrypt(
        this.db.workspaceId,
        'card_invoice_imports.payload',
        row.id,
        row.payload_ciphertext as never,
      ),
    };
  }
}
