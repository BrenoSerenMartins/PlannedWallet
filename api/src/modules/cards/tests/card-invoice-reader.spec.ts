import { describe, expect, it } from 'vitest';
import {
  readCardInvoice,
  readMercadoPagoInvoice,
} from '../../../core/financial-files/card-invoice-reader.js';

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

  it('accepts dot decimals and an installment column from a card purchases export', async () => {
    const csv = Buffer.from(
      'Data de Compra;Estabelecimento;Parcela;Valor em R$\n2026-11-15;Loja Exemplo;2/6;1850.45',
    );
    const result = await readCardInvoice(csv, 'compras.csv', '2026-11');
    expect(result.lines[0]).toEqual({
      date: '2026-11-15',
      description: 'Loja Exemplo',
      amount: 185045,
      installmentNumber: 2,
      installmentCount: 6,
    });
  });
});

it('separates Mercado Pago purchases from previous payments and financing offers', () => {
  const invoice = readMercadoPagoInvoice(
    [
      [
        'Total a pagar Vence em Limite total',
        'R$ 50,00',
        '10/11/2026 R$ 900,00',
        'Pague sua fatura pelo app Mercado Pago',
      ],
      [
        'Movimentações na fatura',
        '02/11 Pagamento anterior R$ 40,00',
        'Cartão Visa [************1234]',
        '08/10 Loja Exemplo Parcela 2 de 3 R$ 50,00',
      ],
      ['Parcele a fatura do seu Cartão de Crédito Mercado Pago', 'Total R$ 99,00'],
    ],
    '2026-11',
  );
  expect(invoice).toMatchObject({
    institution: 'mercado_pago',
    dueDate: '2026-11-10',
    total: 5000,
    lines: [
      {
        date: '2026-10-08',
        description: 'Loja Exemplo',
        installmentNumber: 2,
        installmentCount: 3,
        amount: 5000,
      },
    ],
    movements: [{ amount: 4000 }],
  });
  expect(invoice?.lines).toHaveLength(1);
});
