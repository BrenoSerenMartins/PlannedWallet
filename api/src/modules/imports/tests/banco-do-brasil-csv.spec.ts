import { describe, expect, it } from 'vitest';
import { parseBancoDoBrasilCsv } from '../parsers/banco-do-brasil/account-csv.parser.js';
import {
  mapInstitutionStatement,
  statementMapperVersion,
} from '../services/statement-institution.js';
import { importSourceEvidence } from '../services/import-source-evidence.js';
import { sourceEvidenceKey } from '../../../core/integration/source-evidence.js';

const header = '"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"';
function csv(rows: string[], encoding: BufferEncoding = 'utf8') {
  return Buffer.from(
    [header, '"30/09/2026","Saldo Anterior","","","10,00",""', ...rows].join('\n'),
    encoding,
  );
}
const movements = [
  '"05/10/2026","Pix - Recebido","Origem exemplo","123","20,00","Entrada"',
  '"05/10/2026","Saldo do dia","","","30,00",""',
  '"06/10/2026","Transferência enviada","Destino exemplo","456","-5,00","Saída"',
  '"06/10/2026","Transferência enviada","Destino exemplo","456","-2,00","Saída"',
  '"06/10/2026","Saldo do dia","","","23,00",""',
  '"31/10/2026","S A L D O","","","23,00",""',
];

describe('Banco do Brasil checking CSV', () => {
  it.each(['utf8', 'latin1'] as const)(
    'reads %s without importing balance rows or collapsing repeated references',
    (encoding) => {
      const result = parseBancoDoBrasilCsv(csv(movements, encoding));
      expect(result).toMatchObject({
        institution: 'banco_do_brasil',
        openingBalance: 1000,
        closingBalance: 2300,
      });
      expect(result.items).toHaveLength(3);
      expect(result.items.map((item) => item.balanceAfter)).toEqual([3000, 2500, 2300]);
      expect(mapInstitutionStatement(result).map((item) => item.transactionType)).toEqual([
        'income',
        'expense',
        'expense',
      ]);
      expect(statementMapperVersion(result)).toBe('banco-do-brasil/account-csv/1');
      const proofs = result.items.map((item) =>
        importSourceEvidence({ ...item, metadata: null }, 'account_statement', 'banco_do_brasil')!,
      );
      expect(proofs.every((proof) => proof.institution === 'banco_do_brasil')).toBe(true);
      expect(new Set(proofs.map(sourceEvidenceKey)).size).toBe(3);
    },
  );

  it('rejects wrong daily balances, missing movements and direction contradictions', () => {
    expect(() =>
      parseBancoDoBrasilCsv(csv(movements.map((row) => row.replace('30,00', '31,00')))),
    ).toThrow('saldo diário');
    expect(() => parseBancoDoBrasilCsv(csv(movements.slice(1)))).toThrow('saldo diário');
    expect(() =>
      parseBancoDoBrasilCsv(csv(movements.map((row) => row.replace('Saída', 'Entrada')))),
    ).toThrow('Movimento inválido');
  });

  it('rejects an unsupported header and a missing closing balance', () => {
    expect(() =>
      parseBancoDoBrasilCsv(Buffer.from('Data,Descrição,Valor\n01/10/2026,Loja,20')),
    ).toThrow('Layout CSV');
    expect(() => parseBancoDoBrasilCsv(csv(movements.slice(0, 1)))).toThrow('saldo final');
  });
});
