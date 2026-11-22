import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Plus,
  CalendarDays,
  CreditCard,
  Target,
  ChevronDown,
  Wallet,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../auth/auth-provider';
import { useWorkspace } from '../workspaces/workspace-provider';
import { useFinancialVisibility } from '../../shared/privacy/financial-visibility';
import { NotificationCenter } from '../../shared/feedback/notification-center';
import { BrandSymbol } from '../../shared/ui/brand-symbol';
import { ErrorState, Loading } from '../../shared/ui/primitives';
import { MonthPicker } from '../../shared/ui/controls/month-picker';
import { dateToday, money } from '../../shared/formatting/money';
import { validMonth } from '../../shared/formatting/month';
import { useDashboard } from './hooks/use-dashboard';
import { AccountsOverview } from './components/accounts-overview';
import { RecentMovements } from './components/recent-movements';
import { FinanceOverview } from './components/finance-overview';
import { CashflowForecast } from '../planning/components/cashflow-forecast';
import { CashflowTrend } from './components/cashflow-trend';
import { MonthOverview } from './components/month-overview';
import '../planning/commitments.css';
import './dashboard.css';
import './bento-dashboard.css';
export function DashboardPage() {
  const { session } = useAuth(),
    { active } = useWorkspace(),
    { visible, toggle } = useFinancialVisibility();
  const [params, setParams] = useSearchParams(),
    [details, setDetails] = useState(false);
  const month = validMonth(params.get('month')) ? params.get('month')! : dateToday().slice(0, 7);
  const { snapshot, summary, movements, plan, transactionsLink } = useDashboard(month);
  const name = String(
    session?.user.user_metadata?.full_name ??
      session?.user.email?.split('@')[0]?.split(/[._-]/)[0] ??
      'você',
  ).split(' ')[0];
  const display = (v: number | undefined) =>
    !visible ? '••••••' : v == null ? 'Não disponível' : money(v);
  const totals = plan.data?.totals,
    used =
      totals && totals.plannedExpense != null && totals.plannedExpense > 0
        ? (totals.actualExpense / totals.plannedExpense) * 100
        : null;
  const partial = snapshot.data?.accounts.some(
    (a) =>
      !['benefit_food', 'benefit_meal', 'reserve'].includes(a.type) &&
      (a.balanceBasis?.kind === 'unknown' || a.balanceBasis?.reviewRequired),
  );
  const percent =
    used === null
      ? null
      : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(used);
  const setMonth = (value: string) => {
    if (validMonth(value)) {
      const next = new URLSearchParams(params);
      next.delete('view');
      next.set('month', value);
      setParams(next);
    }
  };
  return (
    <div className="page-enter dashboard-page bento-dashboard">
      <header className="bento-welcome">
        <div className="welcome-person">
          <Link to="/" className="welcome-brand-mark" aria-label="PlannedWallet — início">
            <BrandSymbol />
          </Link>
          <div>
            <h1 aria-label="Visão geral">Olá, {name}</h1>
          </div>
        </div>
        <div className="welcome-controls">
          <button
            className="icon-button"
            aria-label={visible ? 'Ocultar valores' : 'Mostrar valores'}
            aria-pressed={!visible}
            onClick={toggle}
          >
            {visible ? <Eye size={19} /> : <EyeOff size={19} />}
          </button>
          <NotificationCenter />
          <Link
            to="/workspaces"
            className="mobile-workspace-pill"
            aria-label={`Espaço: ${active?.name ?? 'Seu espaço'}`}
          >
            <span>{active?.name.slice(0, 1).toLocaleUpperCase() ?? '·'}</span>
            <ChevronDown size={14} />
          </Link>
        </div>
        <Link to="/analytics" className="welcome-overview-link">
          Seu dinheiro, em perspectiva <ArrowUpRight size={15} />
        </Link>
      </header>
      <section className="bento-hero-gold balance-hero current-balances" aria-label="Saldos atuais">
        {snapshot.isPending ? (
          <Loading />
        ) : snapshot.isError ? (
          <ErrorState error={snapshot.error} retry={() => void snapshot.refetch()} />
        ) : (
          <>
            <div className="hero-topline">
              <span className="hero-label">
                <Wallet size={16} aria-hidden="true" />
                {partial ? 'Saldo registrado' : 'Saldo disponível'}
              </span>
            </div>
            <strong className="hero-balance tabular-nums">{display(snapshot.data.balance)}</strong>
            <div className="hero-budget">
              <div>
                <span>
                  {!visible
                    ? 'Orçamento oculto'
                    : percent !== null
                      ? `${percent}% do orçamento mensal utilizado`
                      : 'Defina seu orçamento mensal'}
                  <span className="budget-period">
                    {' '}
                    ·{' '}
                    {new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
                      new Date(month + '-01T12:00:00Z'),
                    )}
                  </span>
                </span>
                <Link to={`/planning?month=${month}`} aria-label="Ver planejamento mensal">
                  <ArrowUpRight size={17} />
                </Link>
              </div>
              <div
                className="gold-progress"
                role="progressbar"
                aria-label="Orçamento mensal utilizado"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  visible && used !== null
                    ? Math.min(100, Math.max(0, Math.round(used)))
                    : undefined
                }
                aria-valuetext={
                  !visible
                    ? 'Valor oculto'
                    : used === null
                      ? 'Orçamento não definido'
                      : `${percent}%`
                }
              >
                <span
                  style={{
                    width: visible && used !== null ? `${Math.min(100, Math.max(0, used))}%` : '0%',
                  }}
                />
              </div>
            </div>
            <div className="hero-pockets">
              <div>
                <span>Benefícios · uso restrito</span>
                <strong>{display(snapshot.data.benefitBalance)}</strong>
              </div>
              <div>
                <span>Reservas</span>
                <strong>{display(snapshot.data.reserveBalance)}</strong>
              </div>
              <button
                type="button"
                className="hero-accounts-toggle"
                onClick={() => setDetails(!details)}
                aria-expanded={details}
              >
                {details ? 'Ocultar' : 'Ver contas'}
                <ChevronDown
                  className={
                    details ? 'accounts-toggle-chevron is-open' : 'accounts-toggle-chevron'
                  }
                  size={15}
                />
              </button>
            </div>
            {partial && (
              <p className="field-help">
                Há referências de saldo para conferir. <Link to="/accounts">Revisar contas</Link>
              </p>
            )}
            {details && <AccountsOverview accounts={snapshot.data.accounts} visible={visible} />}
          </>
        )}
      </section>
      <nav className="quick-actions" aria-label="Ações rápidas">
        {[
          { to: '/transactions?new=1', label: 'Novo', Icon: Plus },
          { to: '/transactions?new=1&type=transfer', label: 'Transferir', Icon: ArrowLeftRight },
          { to: `/planning?month=${month}`, label: 'Planejar', Icon: CalendarDays },
          { to: '/cards', label: 'Cartões', Icon: CreditCard },
          { to: '/goals', label: 'Metas', Icon: Target },
        ].map(({ to, label, Icon }) => (
          <Link key={label} className="quick-action" to={to}>
            <span className="soft-btn">
              <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      {summary.isError && !snapshot.isError && (
        <div className="bento-wide">
          <ErrorState error={summary.error} retry={() => void summary.refetch()} />
        </div>
      )}
      <div className="bento-period">
        <h2>Seu mês</h2>
        <label>
          <span className="sr-only">Mês da visão geral</span>
          <MonthPicker
            aria-label="Mês da visão geral"
            clearable={false}
            value={month}
            min="1900-01"
            max="9998-12"
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
      </div>
      {plan.isPending ? (
        <div className="bento-wide">
          <Loading />
        </div>
      ) : plan.isError ? (
        <div className="bento-wide">
          <ErrorState error={plan.error} retry={() => void plan.refetch()} />
        </div>
      ) : (
        totals && (
          <>
            <Link
              to={transactionsLink('income')}
              className="bento-soft-card bento-kpi income-kpi"
              aria-label="Ver receitas do período"
            >
              <span className="kpi-icon income">
                <ArrowDownLeft size={20} />
              </span>
              <span className="kpi-label">Entradas</span>
              <strong className="tabular-nums">{display(totals.actualIncome)}</strong>
              <span className="metric-footnote">
                {totals.plannedIncome == null ? (
                  'Receitas registradas'
                ) : (
                  <>Previsto {display(totals.plannedIncome)}</>
                )}
              </span>
            </Link>
            <Link
              to={transactionsLink('expense')}
              className="bento-soft-card bento-kpi expense-kpi"
              aria-label="Ver despesas do período"
            >
              <span className="kpi-icon expense">
                <ArrowUpRight size={20} />
              </span>
              <span className="kpi-label">Saídas</span>
              <strong className="tabular-nums">{display(totals.actualExpense)}</strong>
              <span className="metric-footnote">
                {totals.plannedExpense == null ? (
                  'Despesas registradas'
                ) : (
                  <>Previsto {display(totals.plannedExpense)}</>
                )}
              </span>
              {visible && used !== null && (
                <svg
                  className="kpi-ring"
                  viewBox="0 0 36 36"
                  role="img"
                  aria-label={`${percent}% do orçamento utilizado`}
                >
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="var(--bg-base)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="var(--gold-primary)"
                    strokeWidth="3"
                    pathLength="100"
                    strokeDasharray={`${Math.min(100, Math.max(0, used))} 100`}
                    strokeLinecap="round"
                    transform="rotate(-90 18 18)"
                  />
                </svg>
              )}
            </Link>
          </>
        )
      )}
      <CashflowTrend month={month} visible={visible} />
      <RecentMovements
        items={movements.data?.items.slice(0, 4)}
        pending={movements.isPending}
        error={movements.error}
        retry={() => void movements.refetch()}
        visible={visible}
        link={transactionsLink()}
      />
      {summary.data && summary.data.unclassified > 0 && (
        <Link className="bento-soft-card bento-review" to={transactionsLink('unclassified')}>
          <div>
            <strong>{summary.data.unclassified} movimentos para revisar</strong>
            <p>Complete a classificação para acompanhar seus totais.</p>
          </div>
          <ArrowUpRight size={18} />
        </Link>
      )}
      <details className="bento-soft-card bento-month-details">
        <summary>
          Resultado e composição do mês <ChevronDown size={16} />
        </summary>
        <MonthOverview
          plan={plan.data}
          planState={plan.isPending ? 'pending' : plan.isError ? 'error' : 'ready'}
          visible={visible}
          link={transactionsLink}
        />
      </details>
      <div className="bento-wide bento-forecast">
        <CashflowForecast visible={visible} compact />
      </div>
      <div className="bento-wide bento-finance">
        <FinanceOverview visible={visible} />
      </div>
    </div>
  );
}
