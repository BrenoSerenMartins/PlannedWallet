import { expect, it } from 'vitest';
import { cashflowRange, dailyCashflow, cumulativeCashflow } from '../cashflow-series';
it('uses inclusive days and an exclusive end across month/year and leap-day boundaries', () => {
  expect(cashflowRange('2026-11', '7D', '2026-11-02')).toEqual({
    from: '2026-10-27',
    until: '2026-11-03',
  });
  expect(cashflowRange('2024-02', '1M', '2026-11-21')).toEqual({
    from: '2024-02-01',
    until: '2024-03-01',
  });
  expect(cashflowRange('2026-12', '7D', '2026-11-21')).toEqual({
    from: '2026-12-25',
    until: '2027-01-01',
  });
});
it('groups by reporting competence, excludes transfers/unknown types and nets expense refunds without inventing a bank balance', () => {
  const row = { transactionDate: '2026-11-01', amount: 10000, transactionType: 'income' as const };
  const points = dailyCashflow('2026-11-01', '2026-11-04', [
    row,
    { ...row, transactionDate: '2026-10-31', reportingDate: '2026-11-01', amount: 70000 },
    { ...row, amount: 80000, transactionType: 'transfer' },
    { ...row, amount: -20000, transactionType: 'unclassified' },
    { ...row, transactionDate: '2026-11-02', amount: -3000, transactionType: 'expense' },
    { ...row, transactionDate: '2026-11-02', amount: 1000, transactionType: 'expense' },
    { ...row, transactionDate: '2026-11-04', amount: 99999 },
  ]);
  expect(points).toEqual([
    { date: '2026-11-01', income: 80000, expense: 0 },
    { date: '2026-11-02', income: 0, expense: 2000 },
    { date: '2026-11-03', income: 0, expense: 0 },
  ]);
  expect(cumulativeCashflow(points).map((p) => p.value)).toEqual([80000, 78000, 78000]);
});
it('keeps a negative cumulative period result and returns zero flows on days with no records', () => {
  const points = dailyCashflow('2026-11-01', '2026-11-03', [
    { transactionDate: '2026-11-02', amount: -1550, transactionType: 'expense' },
  ]);
  expect(cumulativeCashflow(points).map((p) => p.value)).toEqual([0, -1550]);
});
