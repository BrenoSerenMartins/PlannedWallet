import type { Transaction } from '../../shared/api/resources';
export function cashflowRange(month: string, range: string, today: string) {
  const end =
    month === today.slice(0, 7)
      ? today
      : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
          .toISOString()
          .slice(0, 10);
  return {
    from:
      range === '7D'
        ? new Date(Date.parse(end + 'T12:00:00Z') - 6 * 86400000).toISOString().slice(0, 10)
        : month + '-01',
    until: new Date(Date.parse(end + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10),
  };
}
export function dailyCashflow(
  from: string,
  until: string,
  entries: Pick<Transaction, 'transactionDate' | 'reportingDate' | 'amount' | 'transactionType'>[],
) {
  const buckets = new Map<string, { income: number; expense: number }>();
  for (const t of entries) {
    const date = t.reportingDate ?? t.transactionDate;
    if (date < from || date >= until) continue;
    const current = buckets.get(date) ?? { income: 0, expense: 0 };
    if (t.transactionType === 'income') current.income += t.amount;
    else if (t.transactionType === 'expense') current.expense -= t.amount;
    buckets.set(date, current);
  }
  const days = Math.round((Date.parse(until) - Date.parse(from)) / 86400000);
  return Array.from({ length: Math.max(1, days) }, (_, index) => {
    const date = new Date(Date.parse(from + 'T12:00:00Z') + index * 86400000)
      .toISOString()
      .slice(0, 10);
    return { date, ...(buckets.get(date) ?? { income: 0, expense: 0 }) };
  });
}
export function cumulativeCashflow(points: { date: string; income: number; expense: number }[]) {
  let balance = 0;
  return points.map((p) => ({ ...p, value: (balance += p.income - p.expense) }));
}
