import { describe, expect, it } from 'vitest';
import { readCardInvoice } from '../services/card-invoice-reader.js';

describe('generic card invoice reader', () => {
  it('reads a documented CSV structure and installment references', async () => {
    const csv = Buffer.from(
      'Data;Descrição;Valor\n15/11/2026;Loja Exemplo 2/10;R$ 123,45\n16/11/2026;Ajuste; -R$ 10,00',
    );
    const result = await readCardInvoice(csv, 'fatura.csv', '2026-11');
    expect(result.lines).toEqual([
      {
        date: '2026-11-15',
        description: 'Loja Exemplo 2/10',
        amount: 12345,
        installmentNumber: 2,
        installmentCount: 10,
      },
      {
        date: '2026-11-16',
        description: 'Ajuste',
        amount: -1000,
        installmentNumber: null,
        installmentCount: null,
      },
    ]);
    expect(result.total).toBe(11345);
    expect(result.warnings).toHaveLength(1);
  });

  it('rejects unknown CSV columns rather than guessing an invoice layout', async () => {
    await expect(
      readCardInvoice(Buffer.from('merchant,value\nExample,20.00'), 'invoice.csv', '2026-11'),
    ).rejects.toThrow('CSV não reconhecido');
  });
});
