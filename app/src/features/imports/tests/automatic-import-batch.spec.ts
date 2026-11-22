import { beforeEach, expect, it, vi } from 'vitest';
import {
  createDestination,
  importInvoice,
  importStatement,
  type AutomaticImportRow,
} from '../services/automatic-import-batch';
import { request } from '../../../shared/api/client';
vi.mock('../../../shared/api/client', () => ({ request: vi.fn(), jsonBody: JSON.stringify }));
const api = vi.mocked(request);
beforeEach(() => api.mockReset());
const row = {
  id: 'row',
  file: new File(['source'], 'source.csv'),
  status: 'ready',
  detected: { kind: 'account_statement', institution: 'mercado_pago' },
} as AutomaticImportRow;
const item = {
  id: 'item',
  selected: true,
  cardId: null,
  amount: -5000,
  description: 'Pagamento de fatura Cartão de crédito',
  transactionDate: '2026-11-05',
};
it('links an explicit MP card payment only when issuer, cycle and exact bill total agree', async () => {
  api
    .mockResolvedValueOnce({ id: 'source', status: 'draft', version: 1, items: [item] })
    .mockResolvedValueOnce([{ id: 'card', name: 'MP' }])
    .mockResolvedValueOnce({ cards: [{ id: 'card', bills: [{ month: '2026-11', total: 5000 }] }] })
    .mockResolvedValueOnce({
      id: 'source',
      status: 'draft',
      version: 2,
      items: [{ ...item, cardId: 'card' }],
    })
    .mockResolvedValueOnce({ status: 'confirmed' });
  expect((await importStatement(row, { id: 'bank', name: 'MP' }, 'receipt', () => {})).status).toBe(
    'imported',
  );
  expect(api.mock.calls[3][0]).toBe('/imports/source/items/item');
  expect(JSON.parse(String(api.mock.calls[3][1]?.body))).toMatchObject({
    transactionType: 'transfer',
    cardId: 'card',
    cardBillMonth: '2026-11',
  });
  expect(JSON.parse(String(api.mock.calls[4][1]?.body))).toEqual({ version: 2 });
});
it('preserves an unmatched bank payment for review rather than creating a duplicate expense', async () => {
  api
    .mockResolvedValueOnce({ id: 'source', status: 'draft', version: 1, items: [item] })
    .mockResolvedValueOnce([{ id: 'card', name: 'MP' }])
    .mockResolvedValueOnce({ cards: [{ id: 'card', bills: [{ month: '2026-11', total: 6000 }] }] });
  const result = await importStatement(row, { id: 'bank', name: 'MP' }, 'receipt', () => {});
  expect(result.status).toBe('review');
  expect(api.mock.calls).toHaveLength(3);
});

it('does not replace a confirmed invoice silently during a batch', async () => {
  api.mockResolvedValueOnce({
    id: 'invoice',
    status: 'review',
    version: 1,
    billMonth: '2026-11',
    replacesInvoiceId: 'previous',
    parsed: {},
    reconciliation: [],
  });
  const invoice = {
    ...row,
    detected: { kind: 'card_invoice', institution: 'c6', automaticMonth: '2026-11' },
  } as AutomaticImportRow;
  const result = await importInvoice(invoice, { id: 'card', name: 'C6' }, '', () => {});
  expect(result.status).toBe('review');
  expect(api.mock.calls).toHaveLength(1);
});

it('stops before posting a file when the workspace is no longer active', async () => {
  await expect(
    importStatement(row, { id: 'bank', name: 'MP' }, 'receipt', () => {
      throw new Error('Espaço mudou');
    }),
  ).rejects.toThrow('Espaço mudou');
  expect(api).not.toHaveBeenCalled();
});

it('uses the source opening position when creating an absent checking account', async () => {
  api.mockResolvedValueOnce({ id: 'new-bank', name: 'Banco do Brasil' });
  await createDestination(
    {
      kind: 'account_statement',
      institution: 'banco_do_brasil',
      itemCount: 1,
      sourceFormat: 'csv',
      openingBalance: 365,
      closingBalance: 0,
      periodStart: '2026-10-05',
    },
    'key',
  );
  expect(JSON.parse(String(api.mock.calls[0][1]?.body))).toMatchObject({
    openingBalance: 365,
    openingDate: '2026-10-05',
    type: 'checking',
  });
});
