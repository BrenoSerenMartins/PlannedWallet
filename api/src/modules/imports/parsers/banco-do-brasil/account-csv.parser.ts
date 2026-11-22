import { UnprocessableEntityException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import type { ParsedStatement, StatementRow } from '../../contracts/statement.js';
import { parseAmount, statementDate } from '../files/statement-values.js';
import { reconcileStatement } from '../mercado-pago/reconcile-statement.js';

export function parseBancoDoBrasilCsv(buffer: Buffer): ParsedStatement {
  if (!buffer.length || buffer.length > 10 * 1024 * 1024)
    throw new UnprocessableEntityException('O CSV deve ter conteúdo e até 10 MB.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }
  let rows: string[][];
  try {
    rows = parse(text, { bom: true, skip_empty_lines: true, max_record_size: 65536 });
  } catch {
    throw new UnprocessableEntityException('Não foi possível ler o CSV do Banco do Brasil.');
  }
  const expected = ['Data', 'Lançamento', 'Detalhes', 'N° documento', 'Valor', 'Tipo Lançamento'];
  if (JSON.stringify(rows.shift()) !== JSON.stringify(expected))
    throw new UnprocessableEntityException('Layout CSV do Banco do Brasil não reconhecido.');
  if (rows.length > 20010 || rows[0]?.[1] !== 'Saldo Anterior')
    throw new UnprocessableEntityException(
      'O extrato precisa do saldo anterior e até 10.000 movimentos.',
    );
  const opening = rows.shift()!;
  const openingBalance = parseAmount(opening[4]);
  let balance = openingBalance;
  let closingBalance: number | null = null;
  let previousDate = statementDate(opening[0]);
  const items: StatementRow[] = [];
  rows.forEach((row, index) => {
    const transactionDate = statementDate(row[0]);
    if (transactionDate < previousDate)
      throw new UnprocessableEntityException('Datas fora de ordem no CSV.');
    previousDate = transactionDate;
    const [, label, details, reference, rawAmount, direction] = row;
    const amount = parseAmount(rawAmount);
    if (label === 'Saldo do dia' || label === 'S A L D O') {
      if (amount !== balance)
        throw new UnprocessableEntityException('O saldo diário do CSV não confere.');
      closingBalance = amount;
      return;
    }
    if (
      !label?.trim() ||
      !reference?.trim() ||
      !['Entrada', 'Saída'].includes(direction) ||
      (direction === 'Entrada' ? amount <= 0 : amount >= 0)
    )
      throw new UnprocessableEntityException('Movimento inválido no CSV do Banco do Brasil.');
    if (reference.length > 160 || [label, details].filter(Boolean).join(' ').length > 500)
      throw new UnprocessableEntityException('Referência ou descrição fora do limite.');
    balance += amount;
    closingBalance = null;
    items.push({
      sourceRow: index + 3,
      sourcePage: 1,
      transactionDate,
      description: [label, details].filter(Boolean).join(' ').trim(),
      sourceOperationId: reference,
      amount,
      balanceAfter: balance,
    });
  });
  if (closingBalance === null)
    throw new UnprocessableEntityException('O CSV precisa de saldo final conferido.');
  return reconcileStatement({
    institution: 'banco_do_brasil',
    sourceFormat: 'csv',
    reportType: 'account_statement',
    openingBalance,
    closingBalance,
    items,
  });
}
