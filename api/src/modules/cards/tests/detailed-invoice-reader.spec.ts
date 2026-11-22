import { expect, it } from 'vitest';
import { readDetailedInvoice } from '../../../core/financial-files/detailed-invoice-reader.js';
import { readCardInvoice } from '../../../core/financial-files/card-invoice-reader.js';

function page(lines: Array<[number, string]>) {
  return lines.map(([x, text], index) => ({ x, text, y: 800 - index * 20 }));
}

it('reads Inter payments, installments and credits while excluding next-cycle offers', () => {
  const cover = page([
    [50, 'Total da sua fatura'],
    [50, 'R$ 45,00'],
    [329, 'Data de Vencimento'],
    [329, '10/11/2026'],
  ]);
  const detail = page([
    [18, 'Despesas da fatura'],
    [24, '08 de out. 2026 P AGAMENTO ON LINE - + R$ 80,00'],
    [24, '14 de jul. 2026 Loja Exemplo (Parcela 04 de 10) - R$ 50,00'],
    [24, '22 de out. 2026 Estorno exemplo - + R$ 5,00'],
  ]);
  const offers = page([
    [237, 'Próxima fatura'],
    [24, '14 de jul. 2026 Loja Exemplo (Parcela 05 de 10) - R$ 50,00'],
    [24, 'www.bancointer.com.br'],
  ]);
  const result = readDetailedInvoice([cover, detail, offers], '2026-11');
  expect(result).toMatchObject({
    institution: 'inter',
    total: 4500,
    dueDate: '2026-11-10',
    movements: [{ amount: 8000 }],
  });
  expect(result?.lines).toEqual([
    {
      date: '2026-07-14',
      description: 'Loja Exemplo',
      amount: 5000,
      installmentNumber: 4,
      installmentCount: 10,
    },
    {
      date: '2026-10-22',
      description: 'Estorno exemplo',
      amount: -500,
      installmentNumber: null,
      installmentCount: null,
    },
  ]);
});

it('isolates Itaú purchase columns from offers and estimates older installment years explicitly', () => {
  const cover = page([
    [50, 'Banco Itaú'],
    [50, 'Total desta fatura 70,00'],
    [50, 'Vencimento: 09/11/2026'],
  ]);
  const detail = page([
    [133, 'Pagamentos efetuados'],
    [133, '05/10 PAGAMENTO -30,00'],
    [133, 'P Total dos pagamentos -30,00'],
    [133, 'Lançamentos: compras e saques'],
    [133, '02/11 Loja Exemplo 12/12 30,00'],
    [133, '19/10 Compra exemplo 40,00'],
    [133, 'Lançamentos no cartão 70,00'],
    [350, '19/10 Oferta de crédito 999,00'],
  ]);
  const result = readDetailedInvoice([cover, detail], '2026-11');
  expect(result).toMatchObject({
    institution: 'itau',
    total: 7000,
    dueDate: '2026-11-09',
    movements: [{ amount: 3000 }],
  });
  expect(result?.lines).toHaveLength(2);
  expect(result?.lines[0]).toMatchObject({
    date: '2025-11-02',
    installmentNumber: 12,
    installmentCount: 12,
  });
  expect(result?.warnings.join(' ')).toContain('estimado');
});

it('separates C6 settlement payments while keeping fee refunds and points credits', async () => {
  const result = await readCardInvoice(
    Buffer.from(
      'Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)\n05/10/2026;Exemplo;1234;-;Inclusao de Pagamento;Única;0;0;-100.00\n06/10/2026;Exemplo;1234;-;Loja Exemplo;2/3;0;0;80.00\n07/10/2026;Exemplo;1234;-;Estorno Tarifa;Única;0;0;-5.00\n08/10/2026;Exemplo;1234;-;Pagamento com pontos atomos;Única;0;0;-10.00',
    ),
    'fatura.csv',
    '2026-11',
  );
  expect(result).toMatchObject({ institution: 'c6', total: 6500, movements: [{ amount: 10000 }] });
  expect(result.lines.map((line) => line.amount)).toEqual([8000, -500, -1000]);
  expect(result.warnings.join(' ')).toContain('Total calculado');
});

it('rejects invalid PDF password inputs before reading files', async () => {
  await expect(
    readCardInvoice(Buffer.from('%PDF-test'), 'fatura.pdf', '2026-11', 'x'.repeat(129)),
  ).rejects.toThrow('senha');
});

it('identifies the C6 exported due date from its filename without using the currently open month', async () => {
  const csv = Buffer.from(
    'Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)\n01/10/2026;Exemplo;1234;-;Compra exemplo;Única;0;0;50.00',
  );
  const result = await readCardInvoice(csv, 'Fatura_2026-11-05.csv', '2026-01');
  expect(result).toMatchObject({ institution: 'c6', dueDate: '2026-11-05' });
  expect(result.warnings.join(' ')).toContain('nome do CSV');
  expect((await readCardInvoice(csv, 'renomeado.csv', '2026-01')).dueDate).toBeUndefined();
  expect((await readCardInvoice(csv, 'Fatura_2026-02-31.csv', '2026-01')).dueDate).toBeUndefined();
});
