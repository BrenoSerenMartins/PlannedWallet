import { PeriodBudget } from '../../../shared/ui/period-budget';
import type { ReactNode } from 'react';
import { HelpTip } from '../../../shared/ui/tooltip';
import { ArrowDownLeft, ArrowUpRight, PiggyBank, Scale } from 'lucide-react';
import type { MonthlyPlan } from '../../../shared/api/resources';
import { money } from '../../../shared/formatting/money';
const display = (value: number | null) => (value === null ? 'Não definido' : money(value));
export function PlanningSummary({
  plan,
  navigation,
  onEditPlan,
  commitments,
}: {
  plan: MonthlyPlan;
  navigation?: ReactNode;
  onEditPlan?: () => void;
  commitments?: ReactNode;
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
      <PeriodBudget
        budget={plan.budget}
        forecast={{ result: t.plannedResult, contribution: plan.contribution }}
      />
      <section className="planning-metrics" aria-label="Resumo do planejamento">
        <article
          className="planning-metric metric-result bento-hero-gold"
          aria-label="Resultado projetado"
        >
          <div className="planning-result-topline">
            <span>
              <Scale size={18} /> Resultado projetado
            </span>
            {t.resultDifference !== null && (
              <span
                className={`planning-result-difference ${t.resultDifference >= 0 ? 'positive-text' : 'negative-text'}`}
              >
                {t.resultDifference > 0 ? '+' : ''}
                {money(t.resultDifference)} vs. previsto
              </span>
            )}
          </div>
          <strong className="planning-result-value">{money(t.actualResult)}</strong>
          <div className="planning-result-footer">
            <span>Previsto: {display(t.plannedResult)}</span>
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
              <span>
                <ArrowDownLeft size={17} /> Receitas
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
              <span>
                <ArrowUpRight size={17} /> Despesas
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
            <span>
              <PiggyBank size={18} /> Aporte planejado
            </span>
            {onEditPlan && (
              <button type="button" className="text-button" onClick={onEditPlan}>
                {plan.contribution === null ? 'Definir meta' : 'Editar meta'}
              </button>
            )}
          </div>
          {plan.contribution === null ? (
            <p className="planning-contribution-empty">Nenhum aporte definido para este mês</p>
          ) : (
            <>
              <strong>{display(plan.contribution)}</strong>
              <small>Resultado após aporte: {display(t.afterContribution)}</small>
            </>
          )}
          {commitments}
        </article>
        {navigation && <div className="summary-navigation">{navigation}</div>}
      </section>
    </>
  );
}
