import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { MonthlyPlan } from '../../../shared/api/resources';
import { money, shortDate } from '../../../shared/formatting/money';

export function PlanningCardBills({ plan }: { plan: MonthlyPlan }) {
  const bills = (plan.cardBills ?? []).filter((b) => b.included);
  if (!bills.length) return null;
  return (
    <div className="planning-future-commitments" aria-label="Compromissos de cartão">
      <div className="planning-future-commitments-heading">
        <h3>Compromissos previstos</h3>
        <span>
          {bills.length} {bills.length === 1 ? 'fatura' : 'faturas'}
        </span>
      </div>
      <ul>
        {bills.map((bill) => (
          <li key={`${bill.accountId}:${bill.billMonth}`}>
            <div>
              <strong>{bill.name}</strong>
              <small>Vence {shortDate(bill.dueDate)}</small>
            </div>
            <strong>{money(bill.remaining)}</strong>
            <Link
              className="text-button planning-bill-link"
              to={`/cards?card=${bill.cardId}&month=${bill.billMonth}${bill.remaining > 0 ? '&action=pay' : ''}`}
            >
              Ver <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
