import { UnprocessableEntityException } from '@nestjs/common';
import { dateOnly } from '../rest/index.js';
import type { CardInvoiceLine, ParsedCardInvoice } from './card-invoice-reader.js';

export function money(raw: string) {
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
export function date(raw: string, billMonth: string) {
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
export function installments(text: string) {
  const match = text.match(/(?:^|\s)(\d{1,3})\s*\/\s*(\d{1,3})(?:\s|$)/);
  if (!match) return { installmentNumber: null, installmentCount: null };
  const installmentNumber = Number(match[1]),
    installmentCount = Number(match[2]);
  if (installmentNumber < 1 || installmentCount < installmentNumber || installmentCount > 120)
    throw new UnprocessableEntityException('A fatura contém uma parcela que não foi reconhecida.');
  return { installmentNumber, installmentCount };
}
export function validate(
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
