import type { PdfCredentials } from '../../../../core/financial-files/pdf-passwords.js';
import { extractStatement } from './statement.parser.js';
import { statementFileFormat } from '../files/file-format.js';
import { readStatementWorker } from '../../../../core/financial-files/worker-reader.js';
import { parseMercadoPagoTable, type StatementCell } from './tabular-statement.parser.js';
import { isSettlementHeader } from './settlement.parser.js';
import { UnprocessableEntityException } from '@nestjs/common';
export async function extractMercadoPagoStatement(
  buffer: Buffer,
  filename: string,
  credentials?: PdfCredentials,
) {
  const format = statementFileFormat(buffer, filename);
  if (format === 'pdf') return extractStatement(buffer, credentials);
  const result = await readStatementWorker<{ rows: StatementCell[][] }>(
    new URL('../files/tabular-worker.mjs', import.meta.url),
    { buffer, format },
  );
  if (format === 'csv' && isSettlementHeader(result.rows[0] ?? []))
    throw new UnprocessableEntityException(
      'Este arquivo é um relatório EDI de liquidações. Importe o extrato de conta do Mercado Pago em PDF, CSV ou XLSX.',
    );
  return parseMercadoPagoTable(result.rows, format);
}
