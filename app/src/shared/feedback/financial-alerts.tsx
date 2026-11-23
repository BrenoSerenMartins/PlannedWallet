import { ToggleField } from '../ui/controls/toggle-field';
import { notifyBudgetOnDevice } from './device-notifications';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { request } from '../api/client';
import { getRequestWorkspace } from '../api/workspace-selection';
import { useFinanceWrite } from '../api/use-finance-write';
import { FinanceForm } from '../ui/finance-forms';
import { EmptyState, ErrorState, Loading } from '../ui/primitives';
import type { components } from '../api/generated';
type Summary = components['schemas']['AlertsSummaryDto'];
type Preferences = components['schemas']['AlertPreferencesDto'];
function subscribe(fn: () => void) {
  window.addEventListener('plannedwallet:workspace-changed', fn);
  return () => window.removeEventListener('plannedwallet:workspace-changed', fn);
}
export function useFinancialAlerts() {
  const workspace = useSyncExternalStore(subscribe, getRequestWorkspace, () => null);
  const query = useQuery({
    queryKey: ['financial-alerts', workspace],
    queryFn: () => request<Summary>('/alerts/sync', { method: 'POST' }),
    enabled: !!workspace,
    staleTime: 60000,
    retry: false,
  });
  useEffect(() => {
    for (const alert of query.data?.items ?? []) {
      if (alert.kind === 'budget' && !alert.readAt) void notifyBudgetOnDevice(alert.id);
    }
  }, [query.data]);
  return query;
}
export function FinancialAlerts({
  query,
  onClose,
}: {
  query: ReturnType<typeof useFinancialAlerts>;
  onClose: () => void;
}) {
  const write = useFinanceWrite(),
    client = useQueryClient(),
    [error, setError] = useState('');
  if (!getRequestWorkspace()) return null;
  async function action(id: string, kind: string) {
    setError('');
    try {
      await write(`/alerts/${id}`, { action: kind }, undefined, 'PATCH');
      await client.invalidateQueries({ queryKey: ['financial-alerts'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar o aviso.');
    }
  }
  return (
    <section className="persistent-alerts">
      <h3>Alertas financeiros</h3>
      <p className="field-help">
        Atualizados ao consultar o sistema e após alterações. Preferências e dispensas ficam salvas
        para você neste espaço.
      </p>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <ol className="notification-history">
            {query.data.items.map((a) => (
              <li key={a.id}>
                <div>
                  <p>{a.title}</p>
                  <Link className="text-button" to={a.href} onClick={onClose}>
                    Ver detalhes
                  </Link>
                  <div className="inline-actions">
                    {!a.readAt && (
                      <button className="text-button" onClick={() => void action(a.id, 'read')}>
                        Marcar como lido
                      </button>
                    )}
                    <button className="text-button" onClick={() => void action(a.id, 'dismiss')}>
                      Dispensar alerta
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {!query.data.items.length && (
            <EmptyState title="Nenhum alerta financeiro ativo" compact />
          )}
          <details>
            <summary>Preferências de alertas</summary>
            <AlertPreferences
              key={JSON.stringify(query.data.preferences)}
              initial={query.data.preferences}
            />
          </details>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
function AlertPreferences({ initial }: { initial: Preferences }) {
  const [p, setP] = useState(initial),
    write = useFinanceWrite();
  return (
    <FinanceForm
      label="Salvar preferências"
      onSubmit={async () => {
        await write('/alerts/preferences', p, undefined, 'PUT');
      }}
    >
      {(
        [
          ['bills', 'Faturas próximas ou vencidas'],
          ['negativeBalance', 'Previsão de saldo negativo'],
          ['goals', 'Metas com prazo ou cobertura insuficiente'],
        ] as const
      ).map(([key, label]) => (
        <label className="check-row" key={key}>
          <input
            type="checkbox"
            checked={p[key]}
            onChange={(e) => setP({ ...p, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      <label>
        Avisar antes do vencimento (dias)
        <input
          type="number"
          min={0}
          max={30}
          value={p.dueDays}
          onChange={(e) => setP({ ...p, dueDays: Number(e.target.value) })}
        />
      </label>
      <ToggleField checked={p.budgets} onChange={(budgets) => setP({ ...p, budgets })}>
        Avisar ao atingir o limite do orçamento
      </ToggleField>
      <ToggleField
        checked={p.budgetEarly ?? false}
        onChange={(budgetEarly) =>
          setP({ ...p, budgetEarly, budgetPercent: p.budgetPercent === 100 ? 80 : p.budgetPercent })
        }
      >
        Avisar antes de atingir o limite
      </ToggleField>
      {p.budgetEarly && (
        <label>
          Avisar quando faltar (%)
          <input
            type="number"
            required
            min={1}
            max={99}
            value={100 - p.budgetPercent}
            onChange={(e) => setP({ ...p, budgetPercent: 100 - Number(e.target.value) })}
          />
        </label>
      )}
      <p className="field-help">
        Para receber avisos no celular, ative as notificações do dispositivo em{' '}
        <Link to="/settings">Ajustes → Aparência</Link>.
      </p>
    </FinanceForm>
  );
}
