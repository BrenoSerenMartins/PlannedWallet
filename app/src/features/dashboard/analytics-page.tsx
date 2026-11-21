import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Target } from 'lucide-react';
import { useDashboard } from './hooks/use-dashboard';
import { useFinancialVisibility } from '../../shared/privacy/financial-visibility';
import { request } from '../../shared/api/client';
import type { components } from '../../shared/api/generated';
import { dateToday, money } from '../../shared/formatting/money';
import { validMonth } from '../../shared/formatting/month';
import { MonthPicker } from '../../shared/ui/controls/month-picker';
import { ErrorState, Loading } from '../../shared/ui/primitives';
import { HistoryOverview } from './components/history-overview';
import { ExpenseGroups } from './components/expense-groups';
import { MonthOverview } from './components/month-overview';
import './dashboard.css';
import './bento-dashboard.css';
export function AnalyticsPage() {
  const [params, setParams] = useSearchParams(),
    { visible } = useFinancialVisibility();
  const month = validMonth(params.get('month')) ? params.get('month')! : dateToday().slice(0, 7);
  const { summary, plan, transactionsLink } = useDashboard(month);
  const goals = useQuery({
    queryKey: ['goals'],
    queryFn: () => request<components['schemas']['GoalsSummaryDto']>('/goals'),
  });
  const allGroups = summary.data?.expenseGroups.filter((g) => g.amount > 0) ?? [];
  const groups =
      allGroups.length > 5
        ? [
            ...allGroups.slice(0, 4),
            {
              groupId: 'combined',
              name: 'Outros grupos',
              amount: allGroups.slice(4).reduce((n, g) => n + g.amount, 0),
              count: allGroups.slice(4).reduce((n, g) => n + g.count, 0),
            },
          ]
        : allGroups,
    total = groups.reduce((n, g) => n + g.amount, 0),
    colors = [
      'var(--gold-primary)',
      'var(--gold-soft)',
      '#8a7441',
      '#10b981',
      '#42424c',
      '#a4a4ae',
    ];
  let angle = 0;
  const stops = groups.map((g, i) => {
    const start = angle;
    angle += (g.amount / total) * 100;
    return `${colors[i % colors.length]} ${start}% ${angle}%`;
  });
  const setMonth = (value: string) => {
    if (validMonth(value)) setParams({ month: value });
  };
  return (
    <div className="page-enter analytics-page">
      <header className="analytics-header">
        <div>
          <span className="page-intro">Seu dinheiro em perspectiva</span>
          <h1>Métricas</h1>
        </div>
        <label>
          <span className="sr-only">Mês das métricas</span>
          <MonthPicker value={month} required onChange={(e) => setMonth(e.target.value)} />
        </label>
      </header>
      <div className="analytics-grid">
        <section className="bento-soft-card spending-donut">
          <div className="bento-card-heading">
            <h2>Distribuição dos gastos</h2>
            <Link to={transactionsLink('expense')} aria-label="Ver despesas do mês">
              <ArrowUpRight size={18} />
            </Link>
          </div>
          {summary.isPending ? (
            <Loading />
          ) : summary.isError ? (
            <ErrorState error={summary.error} retry={() => void summary.refetch()} />
          ) : !visible ? (
            <div className="chart-hidden">
              ••••••<span>Valores ocultos</span>
            </div>
          ) : total === 0 ? (
            <p className="bento-empty">Ainda não há despesas neste período.</p>
          ) : (
            <>
              <div
                className="spending-ring"
                role="img"
                aria-label={`Despesas do mês: ${money(total)}. Distribuição detalhada abaixo.`}
                style={{ background: `conic-gradient(${stops.join(',')})` }}
              >
                <div>
                  <span>Total do gráfico</span>
                  <strong>{money(total)}</strong>
                </div>
              </div>
              <ul className="donut-legend">
                {groups.slice(0, 5).map((g, i) => (
                  <li key={g.groupId ?? 'other'}>
                    <span
                      className="legend-swatch"
                      style={{ background: colors[i % colors.length] }}
                    />
                    <span>{g.name}</span>
                    <strong>
                      {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(
                        (g.amount / total) * 100,
                      )}
                      %
                    </strong>
                  </li>
                ))}
              </ul>
              {summary.data?.expenseGroups.some((g) => g.amount < 0) && (
                <p className="field-help">
                  Grupos com saldo credor ficam fora do gráfico. O detalhamento mantém estornos e
                  valores líquidos.
                </p>
              )}
            </>
          )}
        </section>
        <HistoryOverview month={month} visible={visible} onMonthChange={setMonth} />
        <ExpenseGroups
          groups={summary.data?.expenseGroups ?? []}
          categories={summary.data?.expenseCategories ?? []}
          visible={visible}
          link={transactionsLink('expense')}
        />
        <section className="bento-soft-card analytics-goals">
          <div className="bento-card-heading">
            <h2>Suas próximas conquistas</h2>
            <Link to="/goals" aria-label="Ver metas">
              <ArrowUpRight size={18} />
            </Link>
          </div>
          {goals.isPending ? (
            <Loading />
          ) : goals.isError ? (
            <ErrorState error={goals.error} retry={() => void goals.refetch()} />
          ) : !goals.data.goals.filter((g) => g.status !== 'archived').length ? (
            <div className="bento-empty">
              <Target size={28} />
              <p>Dê um destino aos seus planos.</p>
              <Link className="text-button" to="/goals">
                Criar minha primeira meta
              </Link>
            </div>
          ) : (
            goals.data.goals
              .filter((g) => g.status !== 'archived')
              .slice(0, 4)
              .map((g) => (
                <Link className="analytics-goal" key={g.id} to="/goals">
                  <div>
                    <strong>{g.name}</strong>
                    <span>{visible ? `${Math.round(g.progress)}%` : '•••'}</span>
                  </div>
                  <progress
                    aria-label={`Progresso de ${g.name}`}
                    aria-valuetext={visible ? `${Math.round(g.progress)}%` : 'Oculto'}
                    max={100}
                    value={visible ? g.progress : 0}
                  />
                  <p>{visible ? `${money(g.allocated)} de ${money(g.target)}` : '••••••'}</p>
                </Link>
              ))
          )}
        </section>
      </div>
      <details className="bento-soft-card analytics-composition">
        <summary>Resultado e disponibilidade do mês</summary>
        <MonthOverview
          plan={plan.data}
          planState={plan.isPending ? 'pending' : plan.isError ? 'error' : 'ready'}
          visible={visible}
          link={transactionsLink}
        />
      </details>
    </div>
  );
}
