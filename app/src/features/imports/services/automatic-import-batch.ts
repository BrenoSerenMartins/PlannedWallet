import { jsonBody, request } from '../../../shared/api/client';
import type { Account, ImportBatch, CardsSummary } from '../../../shared/api/resources';

export const importBanks: Record<string, string> = {
  mercado_pago: 'Mercado Pago',
  alelo: 'Alelo Alimentação',
  banco_do_brasil: 'Banco do Brasil',
  inter: 'Inter',
  itau: 'Itaú',
  c6: 'C6 Bank',
};
export interface DetectedImport {
  kind: 'account_statement' | 'card_invoice';
  institution: string | null;
  itemCount: number;
  sourceFormat: string;
  total?: number;
  openingBalance?: number | null;
  closingBalance?: number | null;
  automaticMonth?: string | null;
  months?: string[];
  periodStart?: string | null;
  periodEnd?: string | null;
  monthSource?: 'document' | 'filename' | null;
  dueDate?: string | null;
  summaryOnly?: boolean;
  warnings?: string[];
}
export interface ImportDestination {
  id: string;
  name: string;
}
export interface AutomaticImportRow {
  id: string;
  file: File;
  status:
    'queued' | 'analyzing' | 'ready' | 'duplicate' | 'importing' | 'imported' | 'review' | 'error';
  detected?: DetectedImport;
  destination?: ImportDestination;
  message?: string;
  reviewUrl?: string;
}
interface InvoicePreview {
  id: string;
  version: number;
  status: string;
  billMonth: string;
  replacesInvoiceId?: string | null;
  parsed: { summaryOnly?: boolean };
  reconciliation: Array<{ confidence: string }>;
}

export function sourceForm(file: File, password = '') {
  const form = new FormData();
  form.set('file', file);
  if (password && file.name.toLowerCase().endsWith('.pdf')) form.set('password', password);
  return form;
}
export async function findDestinations(detected: DetectedImport): Promise<ImportDestination[]> {
  if (!detected.institution) return [];
  if (detected.kind === 'card_invoice')
    return request(
      `/cards/invoice-destinations?institution=${encodeURIComponent(detected.institution)}`,
    );
  const accounts = await request<Account[]>('/accounts');
  return accounts
    .filter(
      (account) =>
        !account.archived &&
        account.institution === detected.institution &&
        (account.institution !== 'alelo' || account.type === 'benefit_food'),
    )
    .map(({ id, name }) => ({ id, name }));
}
export async function createDestination(
  detected: DetectedImport,
  key: string,
): Promise<ImportDestination> {
  const bank = importBanks[detected.institution ?? ''];
  if (!bank) throw new Error('Banco não identificado com segurança.');
  if (detected.kind === 'account_statement')
    return request('/accounts', {
      method: 'POST',
      body: jsonBody({
        name: bank,
        institution: detected.institution,
        type: detected.institution === 'alelo' ? 'benefit_food' : 'checking',
        openingBalance: detected.openingBalance ?? 0,
        ...(detected.periodStart ? { openingDate: detected.periodStart } : {}),
      }),
    });
  const result = await request<{ id: string }>('/cards', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: jsonBody({
      name: bank,
      paymentAccountId: null,
      closingDay: 1,
      dueDay: Number(detected.dueDate?.slice(8, 10) ?? 1),
      limit: 0,
    }),
  });
  return { id: result.id, name: bank };
}
export async function importInvoice(
  row: AutomaticImportRow,
  destination: ImportDestination,
  password: string,
  active: () => void,
) {
  const month = row.detected!.automaticMonth!;
  active();
  const form = sourceForm(row.file, password);
  form.set('billMonth', month);
  const preview = await request<InvoicePreview>(`/cards/${destination.id}/invoices/import`, {
    method: 'POST',
    body: form,
  });
  active();
  const reviewUrl = `/cards?card=${destination.id}&month=${preview.billMonth}`;
  if (preview.replacesInvoiceId)
    return {
      status: 'review' as const,
      reviewUrl,
      message: 'Já existe uma importação confirmada neste ciclo. Revise a substituição.',
    };
  if (preview.status === 'confirmed')
    return {
      status: 'imported' as const,
      reviewUrl,
      message: 'Arquivo já confirmado; nenhuma duplicação.',
    };
  if (
    preview.status !== 'review' ||
    preview.parsed.summaryOnly ||
    preview.reconciliation.some((item) => item.confidence === 'ambiguous')
  )
    return {
      status: 'review' as const,
      reviewUrl,
      message: 'A conciliação desta fatura precisa de revisão.',
    };
  await request(`/cards/invoices/${preview.id}/confirm`, {
    method: 'POST',
    headers: { 'If-Match': String(preview.version) },
  });
  return {
    status: 'imported' as const,
    reviewUrl,
    message: 'Fatura confirmada no ciclo identificado.',
  };
}
async function linkIdentifiedCardPayments(
  preview: ImportBatch,
  institution: string | null,
  active: () => void,
) {
  if (institution !== 'mercado_pago') return preview;
  let updated = preview;
  for (const item of preview.items.filter(
    (item) =>
      item.selected &&
      !item.cardId &&
      item.amount < 0 &&
      /^Pagamento de fatura Cartão de crédito$/i.test(item.description.trim()),
  )) {
    active();
    const matches = await request<ImportDestination[]>(
      '/cards/invoice-destinations?institution=mercado_pago',
    );
    active();
    if (matches.length !== 1) continue;
    const month = item.transactionDate.slice(0, 7);
    const data = await request<CardsSummary>(`/cards?month=${month}`);
    active();
    const card = data.cards.find((card) => card.id === matches[0].id);
    const bill = card?.bills.find((bill) => bill.month === month);
    if (!bill || bill.total !== Math.abs(item.amount)) continue;
    updated = await request<ImportBatch>(`/imports/${preview.id}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'If-Match': String(updated.version) },
      body: jsonBody({
        selected: true,
        transactionType: 'transfer',
        categoryId: null,
        cardId: card!.id,
        cardBillMonth: month,
      }),
    });
  }
  return updated;
}

export async function importStatement(
  row: AutomaticImportRow,
  destination: ImportDestination,
  key: string,
  active: () => void,
) {
  active();
  const form = sourceForm(row.file);
  form.set('accountId', destination.id);
  let preview = await request<ImportBatch>('/imports', { method: 'POST', body: form });
  active();
  const reviewUrl = `/imports/${preview.id}`;
  if (preview.status === 'confirmed')
    return {
      status: 'imported' as const,
      reviewUrl,
      message: 'Extrato já confirmado; nenhuma duplicação.',
    };
  if (preview.status !== 'draft')
    return {
      status: 'review' as const,
      reviewUrl,
      message: 'Este arquivo já possui histórico. Continue pela revisão existente.',
    };
  if (preview.openingMismatch && row.detected!.institution !== 'mercado_pago')
    return {
      status: 'review' as const,
      reviewUrl,
      message:
        'O saldo inicial do arquivo difere da conta existente. Revise a base antes de confirmar os movimentos.',
    };
  preview = await linkIdentifiedCardPayments(preview, row.detected!.institution, active);
  active();
  if (
    preview.items.some(
      (item) =>
        item.selected &&
        /pagamento.*fatura|CREDIFFATO|LUIZA CRED/i.test(item.description) &&
        !item.cardId,
    )
  )
    return {
      status: 'review' as const,
      reviewUrl,
      message:
        'Revise o vínculo dos pagamentos de cartão para evitar contar a mesma despesa duas vezes.',
    };
  await request(`/imports/${preview.id}/confirmations`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: jsonBody({ version: preview.version }),
  });
  return {
    status: 'imported' as const,
    reviewUrl,
    message: 'Movimentos confirmados nas datas originais.',
  };
}
