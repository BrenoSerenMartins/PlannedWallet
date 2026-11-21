import { UnprocessableEntityException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { readStatementWorker } from '../../imports/parsers/files/worker-reader.js';
import { dateOnly } from '../../../core/rest/index.js';

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
};

function money(raw: string) {
  const value = raw
    .replace(/\s|R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) > 1_000_000_000)
    throw new UnprocessableEntityException('A fatura contém um valor que não foi reconhecido.');
  return Math.round(amount * 100);
}
function date(raw: string, billMonth: string) {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return dateOnly(`${iso[1]}-${iso[2]}-${iso[3]}`);
  const parts = raw.split(/[/.-]/).map(Number);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    const year = c < 100 ? 2000 + c : c;
    return dateOnly(`${String(year).padStart(4, '0')}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`);
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
  const installmentNumber = Number(match[1]), installmentCount = Number(match[2]);
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
    }>(new URL('../../imports/parsers/mercado-pago/pdf-worker.mjs', import.meta.url), buffer);
    const lines: CardInvoiceLine[] = [];
    let invoiceTotal: number | undefined;
    for (const page of result.pages) {
      const grouped = new Map<number, string[]>();
      for (const cell of page) {
        const y = Math.round(cell.y / 2) * 2;
        grouped.set(y, [...(grouped.get(y) ?? []), cell.text]);
      }
      for (const row of grouped.values()) {
        const text = row.join(' ').replace(/\s+/g, ' ').trim();
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
  const dateIndex = find(['data', 'date', 'data da compra']);
  const descriptionIndex = find(['descricao', 'description', 'estabelecimento', 'merchant']);
  const amountIndex = find(['valor', 'amount', 'valor da compra']);
  if ([dateIndex, descriptionIndex, amountIndex].some((i) => i < 0))
    throw new UnprocessableEntityException(
      'CSV não reconhecido. Use colunas Data, Descrição e Valor.',
    );
  if (rows.length > 500)
    throw new UnprocessableEntityException('A fatura deve ter no máximo 500 lançamentos.');
  const lines = rows.map((row) => {
    const description = (row[descriptionIndex] ?? '').trim();
    if (!description)
      throw new UnprocessableEntityException('O CSV contém uma compra sem descrição.');
    const inst = installments(description);
    return {
      date: date(row[dateIndex] ?? '', billMonth),
      description,
      amount: money(row[amountIndex] ?? ''),
      ...inst,
    };
  });
  return validate(lines, billMonth, 'csv');
}
