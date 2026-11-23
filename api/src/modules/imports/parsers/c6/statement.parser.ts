import { UnprocessableEntityException } from '@nestjs/common';
import {
  pdfPasswords,
  type PdfCredentials,
} from '../../../../core/financial-files/pdf-passwords.js';
import { readStatementWorker } from '../../../../core/financial-files/worker-reader.js';
import { dateOnly } from '../../../../core/rest/index.js';
import type { ParsedStatement, StatementRow, TextCell } from '../../contracts/statement.js';
import { parseAmount, parseDecimalAmount, statementDate } from '../files/statement-values.js';
import { reconcileStatement } from '../mercado-pago/reconcile-statement.js';

type Cell = string | null | { numeric: string } | { date: string };

function invalid(message = 'Layout de extrato C6 não reconhecido.'): never {
  throw new UnprocessableEntityException(message);
}

function complete(sourceFormat: ParsedStatement['sourceFormat'], items: StatementRow[]) {
  items.sort((first, second) => first.transactionDate.localeCompare(second.transactionDate));
  return reconcileStatement({
    institution: 'c6',
    reportType: 'account_statement',
    sourceFormat,
    openingBalance: null,
    closingBalance: null,
    items,
  });
}

function amount(cell: Cell | undefined) {
  if (cell == null || cell === '') return 0;
  return typeof cell === 'string'
    ? cell.includes(',')
      ? parseAmount(cell)
      : parseDecimalAmount(cell)
    : 'numeric' in cell
      ? parseDecimalAmount(cell.numeric)
      : invalid();
}

function fromTable(rows: Cell[][], format: 'csv' | 'xlsx') {
  const header = rows.findIndex((row) =>
    ['Data Lançamento', 'Data Contábil', 'Título', 'Descrição', 'Entrada(R$)', 'Saída(R$)'].every(
      (label, index) => row[index] === label,
    ),
  );
  if (
    header < 0 ||
    rows[0]?.[0] !== 'Extrato personalizado' ||
    !rows
      .slice(0, header)
      .some((row) => typeof row[0] === 'string' && /^Agência: .+ \/ Conta: /.test(row[0]))
  )
    invalid();
  return complete(
    format,
    rows.slice(header + 1).flatMap((row, index) => {
      if (row.every((cell) => cell == null || cell === '')) return [];
      const [date, , title, detail, credit, debit] = row;
      const incoming = amount(credit);
      const outgoing = amount(debit);
      if (incoming < 0 || Boolean(incoming) === Boolean(outgoing))
        invalid('Entrada ou saída inválida no extrato C6.');
      const description = [title, detail]
        .filter((cell): cell is string => typeof cell === 'string' && !!cell.trim())
        .join(' · ');
      if (!description || description.length > 500 || !date) invalid();
      return [
        {
          transactionDate:
            typeof date === 'string'
              ? statementDate(date)
              : 'date' in date
                ? dateOnly(date.date)
                : invalid(),
          description,
          sourceRow: header + index + 2,
          sourcePage: 1,
          balanceAfter: null,
          sourceOperationId: null,
          amount: incoming || -Math.abs(outgoing),
        },
      ];
    }),
  );
}

function fromOfx(text: string) {
  const field = (source: string, tag: string) =>
    new RegExp(`<${tag}>\\s*([^<\\r\\n]+)`, 'i').exec(source)?.[1]?.trim();
  if (!/^Banco C6 S\.A\.$/i.test(field(text, 'ORG') ?? '') || field(text, 'CURDEF') !== 'BRL')
    invalid();
  if (
    (text.match(/<BANKACCTFROM>/gi)?.length ?? 0) !== 1 ||
    (text.match(/<BANKTRANLIST>/gi)?.length ?? 0) !== 1
  )
    invalid();
  const blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)];
  if (blocks.length > 10000 || blocks.length !== (text.match(/<STMTTRN>/gi)?.length ?? 0))
    invalid();
  return complete(
    'ofx',
    blocks.map(([, row], index) => {
      const date = /^(\d{4})(\d{2})(\d{2})/.exec(field(row, 'DTPOSTED') ?? '');
      const value = field(row, 'TRNAMT');
      const description = field(row, 'MEMO') ?? field(row, 'NAME');
      const id = field(row, 'FITID');
      if (!date || !value || !description || description.length > 500 || !id || id.length > 160)
        invalid();
      const amount = parseDecimalAmount(value);
      if (!amount) invalid();
      return {
        transactionDate: dateOnly(`${date[1]}-${date[2]}-${date[3]}`),
        amount,
        description,
        sourceOperationId: id,
        balanceAfter: null,
        sourceRow: index + 1,
        sourcePage: 1,
      };
    }),
  );
}

export async function extractC6Statement(
  buffer: Buffer,
  filename: string,
  credentials?: PdfCredentials,
) {
  const format = filename.split('.').pop()?.toLowerCase();
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) invalid();
  const candidates = pdfPasswords(credentials);
  const passwords = credentials?.password ? [candidates[0]] : candidates.slice(0, 12);
  if (format === 'pdf') {
    const { pages } = await readStatementWorker<{ pages: TextCell[][] }>(
      new URL('../../../../core/financial-files/pdf-worker.mjs', import.meta.url),
      { buffer, passwords: candidates },
    );
    const text = pages.flat().map((cell) => cell.text);
    if (!text.includes('Extrato personalizado') || !text.some((row) => /^C6 Bank\s*•/.test(row)))
      invalid();
    if (
      text.some((row) => /Sem lançamentos no mês/i.test(row)) &&
      text.filter((row) => /^R\$/.test(row)).every((value) => parseAmount(value) === 0)
    )
      invalid(
        'O PDF C6 não contém movimentos. Exporte o OFX ou CSV de um período com lançamentos.',
      );
    invalid(
      'Este PDF C6 ainda precisa de validação com movimentos. Use o extrato OFX, CSV ou XLSX.',
    );
  }
  if (format !== 'csv' && format !== 'xlsx' && format !== 'zip' && format !== 'ofx') invalid();
  const result = await readStatementWorker<
    { format: 'ofx'; text: string } | { format: 'csv' | 'xlsx'; rows: Cell[][] }
  >(new URL('./c6-container-worker.mjs', import.meta.url), { buffer, format, passwords });
  return result.format === 'ofx' ? fromOfx(result.text) : fromTable(result.rows, result.format);
}
