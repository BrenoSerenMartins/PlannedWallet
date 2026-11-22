import { UnprocessableEntityException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { readStatementWorker } from './worker-reader.js';
import { dateOnly } from '../rest/index.js';

export type CardInvoiceLine = {
  date: string;
  description: string;
  amount: number;
  installmentNumber: number | null;
  installmentCount: number | null;
};
export type ParsedCardInvoice = {
  billMonth: string;
  total: number;
  lines: CardInvoiceLine[];
  sourceFormat: 'csv' | 'pdf';
  warnings: string[];
  institution?: 'mercado_pago' | 'inter' | 'itau' | 'c6';
  summaryOnly?: boolean;
  balanceBreakdown?: { purchases: number; previousBalance: number; paymentsAndCredits: number };
  dueDate?: string;
  movements?: Array<{ date: string; description: string; amount: number }>;
};

function money(raw: string) {
  const token = raw.replace(/\s|R\$/gi, '').trim();
  const negative = token.startsWith('(') && token.endsWith(')');
  const normalized = token.replace(/[()]/g, '');
  const value = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : /\.\d{1,2}$/.test(normalized)
      ? normalized
      : normalized.replace(/\./g, '');
  const amount = /^-?\d+(?:\.\d{1,2})?$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(amount) || Math.abs(amount) > 1_000_000_000)
    throw new UnprocessableEntityException('A fatura contém um valor que não foi reconhecido.');
  return Math.round(amount * 100) * (negative ? -1 : 1);
}
function date(raw: string, billMonth: string) {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return dateOnly(`${iso[1]}-${iso[2]}-${iso[3]}`);
  const parts = raw.split(/[/.-]/).map(Number);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    const year = c < 100 ? 2000 + c : c;
    return dateOnly(
      `${String(year).padStart(4, '0')}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`,
    );
  }
  if (parts.length === 2) {
    const [day, month] = parts;
    let year = Number(billMonth.slice(0, 4));
    const billMonthNumber = Number(billMonth.slice(5, 7));
    if (month > billMonthNumber + 1) year--;
    return dateOnly(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  throw new UnprocessableEntityException('A fatura contém uma data que não foi reconhecida.');
}
function installments(text: string) {
  const match = text.match(/(?:^|\s)(\d{1,3})\s*\/\s*(\d{1,3})(?:\s|$)/);
  if (!match) return { installmentNumber: null, installmentCount: null };
  const installmentNumber = Number(match[1]),
    installmentCount = Number(match[2]);
  if (installmentNumber < 1 || installmentCount < installmentNumber || installmentCount > 120)
    throw new UnprocessableEntityException('A fatura contém uma parcela que não foi reconhecida.');
  return { installmentNumber, installmentCount };
}
function validate(
  lines: CardInvoiceLine[],
  billMonth: string,
  sourceFormat: 'csv' | 'pdf',
  total?: number,
): ParsedCardInvoice {
  if (!lines.length || lines.length > 500)
    throw new UnprocessableEntityException(
      'Não encontrei compras suficientes para revisar nesta fatura.',
    );
  const sum = lines.reduce((totalMinor, line) => totalMinor + line.amount, 0);
  return {
    billMonth,
    total: total ?? sum,
    lines,
    sourceFormat,
    warnings:
      total === undefined
        ? ['Total calculado pela soma das compras; confira antes de conciliar.']
        : [],
  };
}

export function readMercadoPagoInvoice(
  pages: string[][],
  billMonth: string,
): ParsedCardInvoice | null {
  const cover = pages[0] ?? [];
  const label = cover.findIndex((row) => /^Total a pagar\s+Vence em\b/i.test(row));
  if (label < 0 || !cover.some((row) => /fatura pelo app Mercado Pago/i.test(row))) return null;
  const fields = cover.slice(label + 1, label + 4).join(' ');
  const total = fields.match(/^R\$\s*([\d.]+,\d{2})\b/);
  const due = fields.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  if (!total || !due)
    throw new UnprocessableEntityException(
      'Confira o total e o vencimento da fatura Mercado Pago.',
    );
  const dueDate = date(due[1], billMonth);
  const invoiceMonth = dueDate.slice(0, 7);
  const lines: CardInvoiceLine[] = [];
  const movements: NonNullable<ParsedCardInvoice['movements']> = [];
  let section: 'movements' | 'card' | null = null;
  for (const row of pages.slice(1).flat()) {
    if (/^Parcele a fatura|^Seu cartão de crédito|^Compras internacionais$/i.test(row)) break;
    if (/^Movimentações na fatura$/i.test(row)) section = 'movements';
    if (/^Cartão .+\[.*\d{4}\]$/i.test(row)) section = 'card';
    if (/^Total\s+R\$/i.test(row)) section = null;
    const match = row.match(/^(\d{2}\/\d{2}(?:\/\d{4})?) (.+?) (-?R\$\s*[\d.]+,\d{2})$/);
    if (!section || !match) continue;
    const [, rawDate, label, rawAmount] = match;
    const amount = money(rawAmount);
    if (section === 'movements') {
      movements.push({ date: date(rawDate, invoiceMonth), description: label, amount });
      continue;
    }
    const installment = label.match(/\s+Parcela (\d{1,3}) de (\d{1,3})$/i);
    const info = installments(installment ? `${installment[1]}/${installment[2]}` : '');
    let purchaseDate = date(rawDate, invoiceMonth);
    if (rawDate.length === 5 && info.installmentNumber) {
      // The statement prints only day and month for older purchases.
      const [year, month] = invoiceMonth.split('-').map(Number);
      const firstCycle = new Date(Date.UTC(year, month - info.installmentNumber, 1))
        .toISOString()
        .slice(0, 7);
      purchaseDate = date(rawDate, firstCycle);
      if (purchaseDate.slice(0, 7) > firstCycle)
        purchaseDate = date(`${rawDate}/${Number(purchaseDate.slice(0, 4)) - 1}`, invoiceMonth);
    }
    lines.push({
      date: purchaseDate,
      description: installment ? label.slice(0, installment.index) : label,
      amount,
      ...info,
    });
  }
  const result = validate(lines, billMonth, 'pdf', money(total[1]));
  if (lines.some((line) => line.installmentNumber))
    result.warnings.push(
      'O ano de compras parceladas sem data completa foi estimado. Confira antes de confirmar.',
    );
  const purchases = lines.reduce((sum, line) => sum + line.amount, 0);
  const summary = cover.join(' ');
  const previous = summary.match(/Total da fatura de [\p{L}]+\s+R\$\s*([\d.]+,\d{2})/iu);
  const credits = summary.match(/Pagamentos e créditos devolvidos\s+R\$\s*([\d.]+,\d{2})/i);
  const balanceBreakdown =
    previous && credits
      ? { purchases, previousBalance: money(previous[1]), paymentsAndCredits: money(credits[1]) }
      : undefined;
  if (
    purchases !== result.total &&
    (!balanceBreakdown ||
      purchases + balanceBreakdown.previousBalance - balanceBreakdown.paymentsAndCredits !==
        result.total)
  )
    result.warnings.push(
      'Esta fatura precisa da conciliação de saldo anterior, pagamentos ou créditos para ser confirmada.',
    );
  return { ...result, institution: 'mercado_pago', dueDate, movements, balanceBreakdown };
}

export function readInvoiceCover(rows: string[], billMonth: string): ParsedCardInvoice | null {
  const cover = rows.join(' ');
  const amount = '([\\d.]+,\\d{2})';
  const fullDate = '(\\d{2}/\\d{2}/\\d{4})';
  let institution: ParsedCardInvoice['institution'];
  let total: string | undefined;
  let due: string | undefined;
  if (/\binter\b/i.test(cover) && /Total da sua fatura/i.test(cover)) {
    institution = 'inter';
    total = cover.match(new RegExp('Total da sua fatura\\s*R\\$\\s*' + amount, 'i'))?.[1];
    due = cover.match(new RegExp('Data de vencimento\\s*' + fullDate, 'i'))?.[1];
  } else if (/Ita[uú](?:card)?/i.test(cover) && /Total desta fatura/i.test(cover)) {
    institution = 'itau';
    total = cover.match(new RegExp('Total desta fatura\\s*(?:R\\$\\s*)?' + amount, 'i'))?.[1];
    due = cover.match(
      new RegExp('(?:Com vencimento em|Vencimento)\\s*:?\\s*' + fullDate, 'i'),
    )?.[1];
  } else if (/\bC6\s*Bank\b/i.test(cover) && /Sua fatura com vencimento/i.test(cover)) {
    institution = 'c6';
    total = cover.match(new RegExp('chegou no valor de\\s*R\\$\\s*' + amount, 'i'))?.[1];
    due = cover.match(new RegExp('Vencimento\\s*:\\s*' + fullDate, 'i'))?.[1];
  }
  if (!institution) return null;
  if (total === undefined)
    throw new UnprocessableEntityException(
      'Identificamos o emissor, mas não conseguimos ler o total da capa.',
    );
  return {
    billMonth,
    institution,
    total: money(total),
    dueDate: due ? date(due, billMonth) : undefined,
    summaryOnly: true,
    lines: [],
    sourceFormat: 'pdf',
    warnings: [
      'Somente o resumo da fatura foi reconhecido. A confirmação depende da leitura dos lançamentos.',
      ...(!due ? ['O vencimento completo não foi identificado na capa.'] : []),
    ],
  };
}

export async function readCardInvoice(
  buffer: Buffer,
  filename: string,
  billMonth: string,
): Promise<ParsedCardInvoice> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billMonth))
    throw new UnprocessableEntityException('Informe o mês da fatura no formato AAAA-MM.');
  if (!buffer.length || buffer.length > 10 * 1024 * 1024)
    throw new UnprocessableEntityException('O arquivo deve ter conteúdo e até 10 MB.');
  if (buffer.subarray(0, 5).toString() === '%PDF-') {
    const result = await readStatementWorker<{
      pages: Array<Array<{ text: string; x: number; y: number }>>;
    }>(new URL('./pdf-worker.mjs', import.meta.url), buffer);
    const rows = result.pages.map((page) => {
      const grouped = new Map<number, string[]>();
      for (const cell of page) {
        const y = Math.round(cell.y / 2) * 2;
        grouped.set(y, [...(grouped.get(y) ?? []), cell.text]);
      }
      return [...grouped.values()].map((row) => row.join(' ').replace(/\s+/g, ' ').trim());
    });
    const mercadoPago = readMercadoPagoInvoice(rows, billMonth);
    if (mercadoPago) return mercadoPago;
    const cover = readInvoiceCover(rows[0] ?? [], billMonth);
    if (cover) return cover;
    const lines: CardInvoiceLine[] = [];
    let invoiceTotal: number | undefined;
    for (const page of rows) {
      for (const text of page) {
        const totalMatch = text.match(
          /(?:total\s+(?:da\s+)?fatura|valor\s+total)[^\d-]*(-?\s*R\$?\s*[\d.]+,\d{2})/i,
        );
        if (totalMatch) invoiceTotal = Math.abs(money(totalMatch[1]));
        const match = text.match(
          /(?:^|\s)(\d{2}[/.-]\d{2}(?:[/.-]\d{2,4})?)\s+(.+?)\s+(-?\s*R\$?\s*[\d.]+,\d{2})\s*$/,
        );
        if (!match || /total|pagamento|vencimento|saldo anterior/i.test(match[2])) continue;
        const description = match[2].replace(/\s+/g, ' ').trim();
        const inst = installments(description);
        lines.push({
          date: date(match[1], billMonth),
          description,
          amount: money(match[3]),
          ...inst,
        });
      }
    }
    return validate(lines, billMonth, 'pdf', invoiceTotal);
  }
  if (!filename.toLowerCase().endsWith('.csv'))
    throw new UnprocessableEntityException('Envie uma fatura em PDF ou CSV.');
  let rows: string[][];
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    rows = parse(text, {
      bom: true,
      delimiter: text.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',',
      skip_empty_lines: true,
      max_record_size: 65536,
    });
  } catch {
    throw new UnprocessableEntityException('Não foi possível ler o CSV enviado.');
  }
  const header =
    rows.shift()?.map((h) =>
      h
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase(),
    ) ?? [];
  const find = (names: string[]) => header.findIndex((h) => names.includes(h));
  const dateIndex = find(['data', 'date', 'data da compra', 'data de compra']);
  const descriptionIndex = find([
    'descricao',
    'description',
    'descricao da compra',
    'estabelecimento',
    'merchant',
  ]);
  const amountIndex = find(['valor', 'amount', 'valor da compra', 'valor em r$', 'valor (em r$)']);
  const installmentIndex = find(['parcela', 'installment', 'parcela atual']);
  if ([dateIndex, descriptionIndex, amountIndex].some((i) => i < 0))
    throw new UnprocessableEntityException(
      'CSV não reconhecido. Use colunas Data, Descrição e Valor.',
    );
  if (rows.length > 500)
    throw new UnprocessableEntityException('A fatura deve ter no máximo 500 lançamentos.');
  const lines = rows
    .map((row): CardInvoiceLine | null => {
      const description = (row[descriptionIndex] ?? '').trim();
      if (!description)
        throw new UnprocessableEntityException('O CSV contém uma compra sem descrição.');
      if (
        /pagamento\s+(?:da\s+)?fatura|pagto.*fatura|saldo anterior|fatura anterior/i.test(
          description,
        )
      )
        return null;
      const installmentValue = installmentIndex >= 0 ? (row[installmentIndex] ?? '').trim() : '';
      const inst = installments(installmentValue || description);
      return {
        date: date(row[dateIndex] ?? '', billMonth),
        description,
        amount: money(row[amountIndex] ?? ''),
        ...inst,
      };
    })
    .filter((line): line is CardInvoiceLine => line !== null);
  return validate(lines, billMonth, 'csv');
}
