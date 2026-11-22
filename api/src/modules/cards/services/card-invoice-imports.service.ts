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
    if (parsed.dueDate && parsed.dueDate.slice(0, 7) !== billMonth)
      throw new ConflictException(
        `O vencimento identificado pertence a ${parsed.dueDate.slice(0, 7)}. Selecione esse mês para importar esta fatura.`,
      );
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
    if (saved.billMonth !== billMonth && saved.status !== 'review')
      throw new ConflictException(
        `Este arquivo já foi confirmado em ${saved.billMonth}. Selecione esse mês para consultar a importação existente.`,
      );
    if (saved.id !== id && saved.status === 'review')
      await this.imports.refreshReview(
        saved.id,
        saved.version,
        { parsed, reconciliation },
        billMonth,
      );
    return this.get(saved.id);
  }

  async destinations(institution: string) {
    const patterns: Record<string, RegExp> = {
      mercado_pago: /\bmercado\s*pago\b/i,
      inter: /\binter\b/i,
      itau: /\bitau\b/i,
      c6: /\bc6\b/i,
    };
    if (!Object.hasOwn(patterns, institution)) return [];
    const known = new Set(await this.imports.institutionCards(institution));
    const data = await this.cards.snapshot();
    return data.cards
      .filter(
        (card) =>
          !card.archived &&
          (known.has(card.id) ||
            patterns[institution].test(card.name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))),
      )
      .map((card) => ({ id: card.id, name: card.name }));
  }

  async confirm(id: string, version: string, replacesInvoiceId?: string) {
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
    let replaced: string | null = null;
    await this.cardService.applyInvoice(
      invoice.card_id,
      invoice.bill_month,
      parsed.total,
      parsed.lines,
      id,
      async () => {
        const existing = await this.imports.confirmedForMonth(invoice.card_id, invoice.bill_month);
        if (existing && existing.id !== replacesInvoiceId)
          throw new ConflictException(
            `Já existe uma importação confirmada para ${invoice.bill_month}. Reabra a prévia e autorize a substituição, ou selecione outro mês.`,
          );
        if (replacesInvoiceId && existing?.id !== replacesInvoiceId)
          throw new ConflictException(
            'A importação confirmada mudou. Reabra a prévia antes de substituir.',
          );
        replaced = existing?.id ?? null;
        return this.candidates(parsed.lines, invoice.card_id, invoice.bill_month);
      },
      parsed.movements,
    );
    if (replaced) await this.imports.supersede(replaced);
    await this.imports.confirm(id);
    return this.get(id);
  }

  async get(id: string) {
    const invoice = await this.imports.get(id);
    if (!invoice) throw new NotFoundException('Importação de fatura não encontrada.');
    const parsed = (invoice.payload as { parsed: ParsedCardInvoice }).parsed;
    const reconciliation = await this.candidates(parsed.lines, invoice.card_id, invoice.bill_month);
    const existing = await this.imports.confirmedForMonth(invoice.card_id, invoice.bill_month);
    return {
      replacesInvoiceId: existing && existing.id !== invoice.id ? existing.id : null,
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
