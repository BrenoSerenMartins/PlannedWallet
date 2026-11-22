import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { CardsRepository } from '../repositories/cards.repository.js';
import { CardInvoiceImportsRepository } from '../repositories/card-invoice-imports.repository.js';
import { FinancialCryptoService } from '../../../core/crypto/financial-crypto.js';
import { CardsService } from './cards.service.js';
import { requireVersion } from '../../../core/rest/index.js';
import {
  readCardInvoice,
  type CardInvoiceLine,
  type ParsedCardInvoice,
} from '../../../core/financial-files/card-invoice-reader.js';

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
    @Inject(CardsService) private readonly cardService: CardsService,
  ) {}

  private candidates(lines: CardInvoiceLine[], cardId: string, month: string) {
    const used = new Set<string>();
    return this.cards.snapshot().then((data) =>
      lines.map((line, index) => {
        const description = normalized(
          line.description.replace(/\s+\d{1,3}\s*\/\s*\d{1,3}\s*$/, ''),
        );
        const possible = data.purchases.filter(
          (purchase) =>
            purchase.cardId === cardId &&
            !purchase.canceled &&
            purchase.purchaseDate === line.date &&
            !!description &&
            normalized(purchase.description) === description,
        );
        const matches = possible.filter((purchase) =>
          data.entries.some(
            (entry) =>
              entry.purchaseId === purchase.id &&
              entry.billMonth === month &&
              entry.kind === 'purchase' &&
              -entry.amount === line.amount &&
              (line.installmentNumber === null ||
                (entry.installmentNumber === line.installmentNumber &&
                  purchase.installments === line.installmentCount)),
          ),
        );
        if (matches.length === 1 && used.has(matches[0].id))
          return { lineIndex: index, purchaseId: null, confidence: 'unmatched' };
        if (matches.length === 1) used.add(matches[0].id);
        return {
          lineIndex: index,
          purchaseId: matches.length === 1 ? matches[0].id : null,
          confidence:
            matches.length === 1
              ? 'exact'
              : matches.length ||
                  possible.some(
                    (purchase) =>
                      !data.entries.some(
                        (entry) => entry.purchaseId === purchase.id && entry.billMonth === month,
                      ),
                  )
                ? 'ambiguous'
                : 'unmatched',
        };
      }),
    );
  }

  async import(cardId: string, billMonth: string, file: Express.Multer.File, password?: string) {
    const data = await this.cards.snapshot();
    if (!data.cards.some((card) => card.id === cardId))
      throw new NotFoundException('Cartão não encontrado.');
    const parsed = await readCardInvoice(file.buffer, file.originalname, billMonth, password);
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
    if (saved.id !== id && saved.status === 'review' && saved.billMonth === billMonth)
      await this.imports.refreshReview(saved.id, saved.version, { parsed, reconciliation });
    return this.get(saved.id);
  }

  async confirm(id: string, version: string) {
    const invoice = await this.imports.get(id, true);
    if (!invoice) throw new NotFoundException('Importação de fatura não encontrada.');
    if (invoice.status === 'confirmed') {
      if (invoice.version === Number(version)) {
        const { parsed } = invoice.payload as { parsed: ParsedCardInvoice };
        await this.cardService.reconcileConfirmedInvoice(
          invoice.card_id,
          invoice.bill_month,
          parsed,
        );
      }
      return this.get(id);
    }
    requireVersion(invoice.version, version);
    if (invoice.status !== 'review')
      throw new ConflictException('Esta revisão não está mais disponível.');
    const { parsed } = invoice.payload as { parsed: ParsedCardInvoice };
    if (parsed.summaryOnly)
      throw new ConflictException(
        'Somente o resumo foi lido. A fatura ainda não pode ser confirmada.',
      );
    const purchases = parsed.lines.reduce((sum, line) => sum + line.amount, 0);
    const breakdown = parsed.balanceBreakdown;
    if (
      purchases !== parsed.total &&
      (!breakdown ||
        purchases + breakdown.previousBalance - breakdown.paymentsAndCredits !== parsed.total)
    )
      throw new ConflictException(
        'O total a pagar inclui ajustes que ainda precisam ser conciliados.',
      );
    await this.cardService.applyInvoice(
      invoice.card_id,
      invoice.bill_month,
      parsed.total,
      parsed.lines,
      id,
      async () => {
        if (await this.imports.hasConfirmed(invoice.card_id, invoice.bill_month))
          throw new ConflictException('Já existe uma fatura confirmada para este cartão e mês.');
        return this.candidates(parsed.lines, invoice.card_id, invoice.bill_month);
      },
      parsed.movements,
    );
    await this.imports.confirm(id);
    return this.get(id);
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
