import type { PlanningLine } from '../../../shared/api/resources';
import { money } from '../../../shared/formatting/money';
export function BudgetLine({ line, type }: { line: PlanningLine; type: 'income' | 'expense' }) {
  const difference = line.difference;
  const progress =
    line.planned && line.planned > 0
      ? Math.min(100, Math.max(0, (line.actual / line.planned) * 100))
      : 0;
  const exceeded = type === 'expense' && difference !== null && difference < 0;
  return (
    <article className={`budget-line${exceeded ? ' is-exceeded' : ''}`} role="listitem">
      <div className="budget-line-topline">
        <div className="budget-identity">
          <span style={{ background: line.color }} />
          <strong>{line.name}</strong>
        </div>
        <strong className="budget-line-actual">
          <small>Realizado</small>
          {money(line.actual)}
        </strong>
      </div>
      {line.planned !== null && (
        <div className="budget-progress" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="budget-progress-footer">
        <span>{line.planned === null ? 'Sem previsão' : `Previsto: ${money(line.planned)}`}</span>
        <strong
          className={
            exceeded
              ? 'negative-text'
              : difference !== null && difference >= 0
                ? 'positive-text'
                : ''
          }
        >
          {difference === null
            ? null
            : type === 'income'
              ? `${difference >= 0 ? 'Acima' : 'Abaixo'}: ${money(Math.abs(difference))}`
              : `${exceeded ? 'Excedido' : 'Livre'}: ${money(Math.abs(difference))}`}
        </strong>
      </div>
    </article>
  );
}
