import { useState } from 'react';
import { CompactForecast } from './compact-forecast';
import { CommitmentForm } from './commitment-form';
import { Modal } from '../../../shared/ui/primitives';
import { Link } from 'react-router-dom';
import { HelpTip } from '../../../shared/ui/tooltip';
import { ArrowRight } from 'lucide-react';
import { dateToday, money, shortDate } from '../../../shared/formatting/money';
import { Loading, ErrorState } from '../../../shared/ui/primitives';
import { useCommitments } from '../hooks/use-commitments';
import type { CommitmentsSummary } from '../../../shared/api/resources';
export function ForecastDetails({
  data,
  visible = true,
}: {
  data: CommitmentsSummary;
  visible?: boolean;
}) {
  const value = (amount: number) => (visible ? money(amount) : '••••••');
  const cash = data.projection.filter((a) => a.kind === 'cash');
  const unassigned = (data.cardBills ?? [])
    .filter((b) => !b.accountId)
    .reduce((sum, b) => sum + b.amount, 0);
  const total = (field: 'balance' | 'income' | 'expense' | 'projected') =>
    cash.reduce((sum, row) => sum + row[field], 0) +
    (field === 'expense' ? unassigned : field === 'projected' ? -unassigned : 0);
  return (
    <>
      <div className="forecast-heading">
        <div>
          <h2 className="field-assistance">
            Previsão de saldo
            <HelpTip
              label="Como calculamos a previsão"
              text="Saldo registrado mais recebimentos e menos pagamentos pendentes, incluindo faturas. Valores concluídos ou dispensados ficam fora. O orçamento não é somado novamente."
            />
          </h2>
          <p>Até {shortDate(data.through)} · valores estimados</p>
        </div>
      </div>
      {!data.schedules.length && !data.cardBills?.length ? (
        <p className="field-help">Sem compromissos previstos.</p>
      ) : (
        <>
          <div className="forecast-totals">
            <div>
              <span>Dinheiro registrado</span>
              <strong>{value(total('balance'))}</strong>
            </div>
            <div>
              <span>A receber</span>
              <strong className={total('income') > 0 ? 'income' : 'amount-neutral'}>
                {value(total('income'))}
              </strong>
            </div>
            <div>
              <span>A pagar</span>
              <strong className={total('expense') > 0 ? 'expense' : 'amount-neutral'}>
                {value(total('expense'))}
              </strong>
            </div>
            <div className="forecast-result">
              <span>Dinheiro previsto</span>
              <strong className={total('projected') < 0 ? 'expense' : ''}>
                {value(total('projected'))}
              </strong>
            </div>
          </div>
          {data.overdueCount > 0 && (
            <p className="forecast-warning">
              {data.overdueCount} em atraso · {value(data.overdueExpense)} a pagar e{' '}
              {value(data.overdueIncome)} a receber.
            </p>
          )}
          {unassigned > 0 && (
            <p className="field-help">Inclui {value(unassigned)} em faturas sem conta vinculada.</p>
          )}
          <details className="forecast-accounts">
            <summary>Previsão por conta · benefícios e reservas separados</summary>
            <ul>
              {data.projection.map((a) => (
                <li key={a.accountId}>
                  <div>
                    <strong>{a.name}</strong>
                    <span>
                      {a.kind === 'benefits'
                        ? 'Benefício de uso restrito'
                        : a.kind === 'reserves'
                          ? 'Reserva'
                          : 'Dinheiro disponível'}
                    </span>
                  </div>
                  <div>
                    <strong className={a.projected < 0 ? 'expense' : ''}>
                      {value(a.projected)}
                    </strong>
                    <span>
                      Atual {value(a.balance)} · a receber {value(a.income)} · a pagar{' '}
                      {value(a.expense)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </>
  );
}
export function CashflowForecast({
  visible,
  compact = false,
}: {
  visible: boolean;
  compact?: boolean;
}) {
  const month = dateToday().slice(0, 7);
  const { query, write } = useCommitments(month);
  const [adding, setAdding] = useState(false);
  return (
    <section
      className={`panel cashflow-forecast ${compact ? 'forecast-compact' : ''}`}
      aria-label="Previsão de saldo"
    >
      {query.isPending ? (
        <Loading layout="summary" />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : compact ? (
        <CompactForecast data={query.data} visible={visible} onAdd={() => setAdding(true)} />
      ) : (
        <ForecastDetails data={query.data} visible={visible} />
      )}
      {!compact && (
        <Link className="text-button" to={`/planning?view=commitments&month=${month}`}>
          Ver compromissos <ArrowRight size={16} />
        </Link>
      )}
      <Modal open={adding} onOpenChange={setAdding} title="Novo compromisso">
        {adding && (
          <CommitmentForm
            onSave={async (data, key) => {
              await write('', data, undefined, 'POST', key);
              setAdding(false);
            }}
          />
        )}
      </Modal>
    </section>
  );
}
