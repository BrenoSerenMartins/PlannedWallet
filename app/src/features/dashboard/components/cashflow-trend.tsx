import { useId, useState } from 'react';
import { cashflowRange, dailyCashflow, cumulativeCashflow } from '../cashflow-series';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/auth-provider';
import { request } from '../../../shared/api/client';
import type { Collection, Transaction } from '../../../shared/api/resources';
import { dateToday, money } from '../../../shared/formatting/money';
import { ErrorState, Loading } from '../../../shared/ui/primitives';
import { useDashboardHistory } from '../hooks/use-dashboard-history';
export function CashflowTrend({ month, visible }: { month: string; visible: boolean }) {
  const [range, setRange] = useState('1M'),
    [selected, setSelected] = useState<number | null>(null),
    id = useId().replaceAll(':', ''),
    { session } = useAuth();
  const { from, until } = cashflowRange(month, range, dateToday());
  const daily = useQuery({
    queryKey: [session?.user.id, 'cashflow-daily', from, until],
    enabled: range !== '6M',
    queryFn: async ({ signal }) => {
      const items: Transaction[] = [],
        cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const p: URLSearchParams = new URLSearchParams({
          from,
          to: until,
          limit: '100',
          ...(cursor ? { cursor } : {}),
        });
        const data: Collection<Transaction> = await request<Collection<Transaction>>(
          '/transactions?' + p,
          { signal },
        );
        items.push(...data.items);
        cursor = data.nextCursor;
        if (cursor && cursors.has(cursor)) throw new Error('A consulta mudou. Atualize o gráfico.');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return items;
    },
  });
  const history = useDashboardHistory(month, '7');
  const points =
    range === '6M'
      ? (history.data?.items
          .slice(-6)
          .map((m) => ({ date: m.month + '-01', income: m.income, expense: m.expense })) ?? [])
      : dailyCashflow(from, until, daily.data ?? []);
  const data = cumulativeCashflow(points);
  const state = range === '6M' ? history : daily,
    active = data[Math.min(selected ?? data.length - 1, data.length - 1)],
    values = data.map((p) => p.value),
    minimum = Math.min(0, ...values),
    maximum = Math.max(0, ...values),
    spread = maximum - minimum || 1;
  const x = (i: number) => 12 + (i * 576) / Math.max(1, data.length - 1),
    y = (v: number) => 112 - ((v - minimum) / spread) * 96;
  let line = '';
  data.forEach((p, i) => {
    if (!i) line = `M ${x(i)} ${y(p.value)}`;
    else {
      const mid = (x(i - 1) + x(i)) / 2;
      line += ` C ${mid} ${y(data[i - 1].value)}, ${mid} ${y(p.value)}, ${x(i)} ${y(p.value)}`;
    }
  });
  const label = (date: string) =>
    new Intl.DateTimeFormat(
      'pt-BR',
      range === '6M'
        ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
        : { day: '2-digit', month: 'short', timeZone: 'UTC' },
    ).format(new Date(date + 'T12:00:00Z'));
  return (
    <section className="bento-soft-card cashflow-trend" aria-label="Fluxo financeiro">
      <div className="bento-card-heading">
        <h2>Fluxo financeiro</h2>
        <div className="trend-ranges" role="group" aria-label="Período do gráfico">
          {['7D', '1M', '6M'].map((r) => (
            <button
              key={r}
              aria-pressed={range === r}
              onClick={() => {
                setRange(r);
                setSelected(null);
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {state.isPending ? (
        <Loading layout="chart" />
      ) : state.isError ? (
        <ErrorState error={state.error} retry={() => void state.refetch()} />
      ) : !visible ? (
        <div className="chart-hidden">
          ••••••<span>Gráfico oculto</span>
        </div>
      ) : !data.length ? (
        <p className="bento-empty">Ainda não há histórico neste período.</p>
      ) : (
        <>
          <div className="trend-summary">
            <strong className="tabular-nums">{money(active?.value ?? 0)}</strong>
            <span>Resultado acumulado{active ? ` · ${label(active.date)}` : ''}</span>
          </div>
          <div className="trend-plot" onMouseLeave={() => setSelected(null)}>
            <svg
              viewBox="0 0 600 132"
              preserveAspectRatio="none"
              role="img"
              aria-label="Resultado acumulado de receitas menos despesas no período"
            >
              <defs>
                <linearGradient id={`gold-area-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold-primary)" stopOpacity=".25" />
                  <stop offset="100%" stopColor="var(--gold-primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {data.length > 0 && (
                <>
                  <path
                    d={`${line} L ${x(data.length - 1)} 132 L 12 132 Z`}
                    fill={`url(#gold-area-${id})`}
                  />
                  <path
                    d={line}
                    fill="none"
                    stroke="var(--gold-primary)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {active && selected !== null && (
                    <circle
                      cx={x(Math.min(selected, data.length - 1))}
                      cy={y(active.value)}
                      r="4"
                      fill="var(--gold-soft)"
                      stroke="var(--bg-base)"
                      strokeWidth="2"
                    />
                  )}
                </>
              )}
            </svg>
            <div
              className="trend-interaction"
              role="slider"
              tabIndex={0}
              aria-label="Dia ou mês do fluxo financeiro"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, data.length - 1)}
              aria-valuenow={selected ?? Math.max(0, data.length - 1)}
              aria-valuetext={
                active
                  ? `${label(active.date)}: entradas ${money(active.income)}, saídas ${money(active.expense)}, resultado acumulado ${money(active.value)}`
                  : 'Sem dados'
              }
              onFocus={() => setSelected(data.length - 1)}
              onPointerMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                setSelected(
                  Math.min(
                    data.length - 1,
                    Math.max(
                      0,
                      Math.round(((e.clientX - box.left) / box.width) * (data.length - 1)),
                    ),
                  ),
                );
              }}
              onPointerDown={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                setSelected(
                  Math.min(
                    data.length - 1,
                    Math.max(
                      0,
                      Math.round(((e.clientX - box.left) / box.width) * (data.length - 1)),
                    ),
                  ),
                );
              }}
              onKeyDown={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                  e.preventDefault();
                  setSelected(
                    e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? data.length - 1
                        : Math.min(
                            data.length - 1,
                            Math.max(
                              0,
                              (selected ?? data.length - 1) + (e.key === 'ArrowRight' ? 1 : -1),
                            ),
                          ),
                  );
                }
              }}
            />
            {selected !== null && active && (
              <div className="trend-tooltip" role="status">
                <strong>{label(active.date)}</strong>
                <span>Entradas {money(active.income)}</span>
                <span>Saídas {money(active.expense)}</span>
              </div>
            )}
          </div>
          <div className="trend-dates">
            <span>{data[0] ? label(data[0].date) : ''}</span>
            <span>{data.at(-1) ? label(data.at(-1)!.date) : ''}</span>
          </div>
        </>
      )}
    </section>
  );
}
