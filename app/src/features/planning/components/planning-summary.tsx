import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { HelpTip } from '../../../shared/ui/tooltip';
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MonthlyPlan } from '../../../shared/api/resources';
import { money } from '../../../shared/formatting/money';
import { MonthPicker } from '../../../shared/ui/controls/month-picker';
import { shiftMonth } from '../../../shared/formatting/month';
const display = (value: number | null) => (value === null ? 'Não definido' : money(value));
export function PlanningSummary({
  plan,
  navigation,
  onEditPlan,
  commitments,
  month,
  onMonthChange,
  periodActions,
}: {
  plan: MonthlyPlan;
  navigation?: ReactNode;
  onEditPlan?: () => void;
  commitments?: ReactNode;
  month: string;
  onMonthChange: (month: string) => void;
  periodActions?: ReactNode;
}) {
  const { totals: t } = plan;
  const incomeProgress =
    t.plannedIncome && t.plannedIncome > 0
      ? Math.min(100, Math.max(0, (t.actualIncome / t.plannedIncome) * 100))
      : 0;
  const expenseProgress =
    t.plannedExpense && t.plannedExpense > 0
      ? Math.min(100, Math.max(0, (t.actualExpense / t.plannedExpense) * 100))
      : 0;
  const resultProgress =
    t.actualIncome > 0 ? Math.min(100, Math.max(0, (t.actualExpense / t.actualIncome) * 100)) : 0;
  return (
    <>
      <section className="planning-metrics" aria-label="Resumo do planejamento">
        <article
          className="planning-metric metric-result bento-hero-gold"
          aria-label="Resultado projetado"
        >
          <div className="planning-result-topline">
            <span>Resultado projetado</span>
            <div className="planning-hero-controls">
              <div className="future-month-navigation" aria-label="Navegar entre meses">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Mês anterior"
                  disabled={month === '1900-01'}
                  onClick={() => onMonthChange(shiftMonth(month, -1))}
                >
                  <ChevronLeft size={16} />
                </button>
                <label className="period-picker">
                  <span className="sr-only">Mês do plano</span>
                  <MonthPicker
                    clearable={false}
                    compactLabel
                    aria-label="Mês do planejamento"
                    min="1900-01"
                    max="9998-12"
                    value={month}
                    onChange={(e) => e.target.value && onMonthChange(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Próximo mês"
                  disabled={month === '9998-12'}
                  onClick={() => onMonthChange(shiftMonth(month, 1))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              {periodActions}
            </div>
          </div>
          <div className="planning-result-mainline">
            <strong className="planning-result-value">{money(t.actualResult)}</strong>
            {t.resultDifference !== null && (
              <span
                className={`planning-result-difference ${t.resultDifference >= 0 ? 'positive-text' : 'negative-text'}`}
              >
                {t.resultDifference > 0 ? '+' : ''}
                {money(t.resultDifference)} vs. previsto
              </span>
            )}
          </div>
          <div className="planning-result-footer">
            <div className="planning-result-footer-row">
              <span>Previsto: {display(t.plannedResult)}</span>
              {!!plan.budget?.accounts.length && (
                <Link to="/accounts" className="planning-balance-link">
                  {plan.budget.coverage === 'complete' ? 'Ver contas' : 'Conferir saldos'}
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              )}
            </div>
            <div
              className="planning-result-meter"
              role="img"
              aria-label={`Despesas realizadas equivalem a ${Math.round(resultProgress)}% das receitas realizadas`}
            >
              <span style={{ width: `${resultProgress}%` }} />
            </div>
          </div>
        </article>
        <div className="planning-monthly-pair">
          <article className="planning-metric metric-income bento-soft-card" aria-label="Receitas">
            <div className="planning-small-metric-title">
              <span className="planning-title-copy">
                <span className="planning-icon-badge income">
                  <ArrowDownLeft size={18} aria-hidden="true" />
                </span>
                Receitas
              </span>
              <HelpTip
                label="Receitas"
                text="Receitas realizadas e previstas no mês selecionado."
              />
            </div>
            <strong className="planning-small-metric-value">{money(t.actualIncome)}</strong>
            <div
              className="planning-meter"
              role="img"
              aria-label={`Receitas: ${Math.round(incomeProgress)}% do previsto`}
            >
              <span style={{ width: `${incomeProgress}%` }} />
            </div>
            <p className="planning-small-metric-foot">Previsto {display(t.plannedIncome)}</p>
          </article>
          <article className="planning-metric metric-expense bento-soft-card" aria-label="Despesas">
            <div className="planning-small-metric-title">
              <span className="planning-title-copy">
                <span className="planning-icon-badge expense">
                  <ArrowUpRight size={18} aria-hidden="true" />
                </span>
                Despesas
              </span>
              <HelpTip
                label="Despesas"
                text="Despesas realizadas no mês comparadas ao orçamento."
              />
            </div>
            <strong className="planning-small-metric-value">{money(t.actualExpense)}</strong>
            <div
              className="planning-meter"
              role="img"
              aria-label={`Despesas: ${Math.round(expenseProgress)}% do orçamento`}
            >
              <span style={{ width: `${expenseProgress}%` }} />
            </div>
            <p
              className={`planning-small-metric-foot ${t.expenseDifference !== null && t.expenseDifference >= 0 ? 'positive-text' : 'negative-text'}`}
            >
              {t.expenseDifference === null
                ? `Previsto ${display(t.plannedExpense)}`
                : t.expenseDifference >= 0
                  ? `Livre ${money(t.expenseDifference)}`
                  : `Excedido ${money(Math.abs(t.expenseDifference))}`}
            </p>
          </article>
        </div>
        <article
          className="planning-metric metric-contribution bento-soft-card"
          aria-label="Aporte planejado"
        >
          <div className="planning-contribution-heading">
            <span>Aporte planejado</span>
            {onEditPlan && (
              <button type="button" className="text-button" onClick={onEditPlan}>
                {plan.contribution === null ? 'Definir meta' : 'Editar meta'}
              </button>
            )}
          </div>
          {plan.contribution === null ? (
            <p className="planning-contribution-empty">Sem meta de aporte</p>
          ) : (
            <>
              <strong>{display(plan.contribution)}</strong>
              <small>Resultado após aporte: {display(t.afterContribution)}</small>
            </>
          )}
        </article>
        {commitments}
        {navigation && <div className="summary-navigation">{navigation}</div>}
      </section>
    </>
  );
}
