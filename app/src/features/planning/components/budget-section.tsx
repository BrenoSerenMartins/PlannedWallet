import { money } from '../../../shared/formatting/money';
import { Link } from 'react-router-dom';
import type { PlanningLine } from '../../../shared/api/resources';
import { planningGroupTotals } from '../group-totals';
import { BudgetLine } from './budget-line';
const groupKey = (line: PlanningLine) =>
  line.categoryId === null ? 'uncategorized' : (line.groupId ?? 'ungrouped');
export function BudgetSection({
  type,
  lines,
}: {
  type: 'income' | 'expense';
  lines: PlanningLine[];
}) {
  const visibleLines = lines.filter(
    (line) =>
      !line.archived ||
      line.actual !== 0 ||
      line.transactionCount > 0 ||
      (line.planned !== null && line.planned !== 0),
  );
  return (
    <section className={`budget-section budget-${type}`}>
      <div className="section-heading">
        <div>
          <h2>{type === 'income' ? 'Receitas previstas' : 'Orçamento de despesas'}</h2>
        </div>
      </div>
      {!visibleLines.length ? (
        <div className="planning-empty">
          Crie categorias de {type === 'income' ? 'receita' : 'despesa'} para organizar seu plano.{' '}
          <Link to="/categories">Gerenciar categorias</Link>
        </div>
      ) : (
        <div className="budget-lines" role="list">
          {[...new Set(visibleLines.map(groupKey))].map((id) => {
            const children = visibleLines.filter((line) => groupKey(line) === id);
            const totals = planningGroupTotals(children, type);
            const progress =
              totals.planned && totals.planned > 0
                ? Math.min(100, Math.max(0, (totals.actual / totals.planned) * 100))
                : 0;
            const exceeded =
              type === 'expense' && totals.difference !== null && totals.difference < 0;
            return (
              <details
                className="budget-group"
                key={id}
                open={
                  (children.length > 1 && ['uncategorized', 'ungrouped'].includes(id)) || undefined
                }
              >
                <summary>
                  <span className="budget-group-identity">
                    <strong>{children[0].groupName ?? 'Sem grupo'}</strong>
                    <small>
                      {children.length} {children.length === 1 ? 'cat.' : 'cats.'}
                    </small>
                  </span>
                  <strong className="budget-group-actual">
                    <small>Realizado</small>
                    {money(totals.actual)}
                  </strong>
                  <span
                    className={`budget-progress${exceeded ? ' is-exceeded' : ''}`}
                    aria-hidden="true"
                  >
                    <i style={{ width: `${progress}%` }} />
                  </span>
                  <span className="budget-progress-footer">
                    <span>
                      {totals.planned === null
                        ? 'Sem previsão'
                        : `Previsto: ${money(totals.planned)}`}
                    </span>
                    <strong
                      className={
                        exceeded
                          ? 'negative-text'
                          : totals.difference !== null && totals.difference >= 0
                            ? 'positive-text'
                            : ''
                      }
                    >
                      {totals.difference === null
                        ? null
                        : type === 'income'
                          ? `${totals.difference >= 0 ? 'Acima' : 'Abaixo'}: ${money(Math.abs(totals.difference))}`
                          : `${exceeded ? 'Excedido' : 'Livre'}: ${money(Math.abs(totals.difference))}`}
                    </strong>
                  </span>
                </summary>
                <div className="budget-group-content">
                  {children.map((line) => (
                    <BudgetLine key={line.categoryId ?? 'uncategorized'} line={line} type={type} />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
