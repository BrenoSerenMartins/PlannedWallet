import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { CardsRepository } from '../repositories/cards.repository.js';
import { CardInvoiceImportsRepository } from '../repositories/card-invoice-imports.repository.js';
import { FinancialCryptoService } from '../../../core/crypto/financial-crypto.js';
import { DatabaseService } from '../../../core/database/index.js';
import {
  readCardInvoice,
  type CardInvoiceLine,
  type ParsedCardInvoice,
} from './card-invoice-reader.js';

function normalized(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

@Injectable()
export class CardInvoiceImportsService {
  constructor(
    @Inject(CardsRepository) private readonly cards: CardsRepository,
    @Inject(CardInvoiceImportsRepository) private readonly imports: CardInvoiceImportsRepository,
    @Inject(FinancialCryptoService) private readonly crypto: FinancialCryptoService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private candidates(lines: CardInvoiceLine[], cardId: string, month: string) {
    return this.cards.snapshot().then((data) =>
      lines.map((line, index) => {
        const matches = data.purchases.filter((purchase) => {
          if (
            purchase.cardId !== cardId ||
            purchase.canceled ||
            purchase.purchaseDate !== line.date
          )
            return false;
          const entry = data.entries.find(
            (e) => e.purchaseId === purchase.id && e.billMonth === month,
          );
          if (!entry || Math.abs(entry.amount) !== line.amount) return false;
          const a = normalized(purchase.description),
            b = normalized(line.description);
          return a === b || a.includes(b) || b.includes(a);
        });
        return {
          lineIndex: index,
          purchaseId: matches.length === 1 ? matches[0].id : null,
          confidence: matches.length === 1 ? 'exact' : matches.length ? 'ambiguous' : 'unmatched',
        };
      }),
    );
  }

  async import(cardId: string, billMonth: string, file: Express.Multer.File) {
    const data = await this.cards.snapshot();
    if (!data.cards.some((card) => card.id === cardId))
      throw new NotFoundException('Cartão não encontrado.');
    const parsed = await readCardInvoice(file.buffer, file.originalname, billMonth);
    const fingerprint = await this.crypto.fingerprint(
      createHash('sha256').update(file.buffer).digest('hex'),
    );
    const id = randomUUID();
    const sourceName = file.originalname.toLowerCase().endsWith('.pdf')
      ? 'Fatura PDF'
      : 'Fatura CSV';
    const reconciliation = await this.candidates(parsed.lines, cardId, billMonth);
    const saved = await this.imports.save(id, cardId, billMonth, sourceName, fingerprint, {
      parsed,
      reconciliation,
    });
    return { ...saved, cardId };
  }

  async get(id: string) {
    const invoice = await this.imports.get(id);
    if (!invoice) throw new NotFoundException('Importação de fatura não encontrada.');
    const parsed = (invoice.payload as { parsed: ParsedCardInvoice }).parsed;
    const reconciliation = await this.candidates(parsed.lines, invoice.card_id, invoice.bill_month);
    return {
      id: invoice.id,
      cardId: invoice.card_id,
      billMonth: invoice.bill_month,
      sourceName: invoice.source_name,
      status: invoice.status,
      version: invoice.version,
      parsed,
      reconciliation,
    };
  }
}
