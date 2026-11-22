import { ToggleField } from '../../../shared/ui/controls/toggle-field';
import { Select } from '../../../shared/ui/controls/select';
import '../counterparties.css';
import { useEffect, useState, type ReactNode } from 'react';
import { CounterpartySuggestions } from './counterparty-suggestions';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { request, jsonBody } from '../../../shared/api/client';
import type { Counterparty, CounterpartyCandidate } from '../../../shared/api/resources';
export function CounterpartyFields({
  accountId,
  description,
  sourceKind = 'manual',
  suggestions,
  rememberIdentity,
  onRememberIdentity,
  agent,
  name,
  remember,
  category,
  automatic,
  onAgent,
  onName,
  onRemember,
  children,
}: {
  accountId: string;
  description: string;
  sourceKind?: string;
  suggestions?: CounterpartyCandidate[];
  rememberIdentity: boolean;
  onRememberIdentity: (value: boolean) => void;
  agent: string;
  name: string;
  remember: boolean;
  category: string;
  automatic: boolean;
  children?: ReactNode;
  onAgent: (value: string) => void;
  onName: (value: string) => void;
  onRemember: (value: boolean) => void;
}) {
  const query = useQuery({
    queryKey: ['counterparties'],
    queryFn: () => request<Counterparty[]>('/counterparties'),
  });
  const [debounced, setDebounced] = useState(description);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(description), 350);
    return () => clearTimeout(timer);
  }, [description]);
  const candidates = useQuery({
    queryKey: ['counterparty-suggestions', accountId, sourceKind, debounced],
    queryFn: () =>
      request<CounterpartyCandidate[]>('/counterparties/suggestions', {
        method: 'POST',
        body: jsonBody({ accountId, sourceKind, value: debounced }),
      }),
    enabled:
      suggestions === undefined &&
      !!accountId &&
      !agent &&
      debounced.trim().length >= 3 &&
      sourceKind !== 'settlement',
    retry: false,
    staleTime: 30000,
  });
  const visibleCandidates =
    suggestions ?? (debounced === description ? (candidates.data ?? []) : []);
  return (
    <>
      {!agent && (
        <CounterpartySuggestions
          candidates={visibleCandidates}
          onSelect={(id) => {
            onAgent(id);
            onRememberIdentity(true);
          }}
        />
      )}
      <details className="secondary-disclosure" open={!!agent || automatic || undefined}>
        <summary>Pessoa ou estabelecimento {automatic ? '· categoria automática' : ''}</summary>
        <div className="form-stack">
          <label>
            Pessoa ou estabelecimento
            <Select
              value={agent}
              onChange={(e) => {
                onAgent(e.target.value);
                if (!e.target.value) onRememberIdentity(false);
              }}
              disabled={query.isPending || query.isError}
            >
              <option value="">Reconhecimento automático</option>
              {(query.data ?? [])
                .filter((a) => a.enabled || a.id === agent)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.enabled ? '' : ' (desativado)'}
                  </option>
                ))}
              <option value="new">Criar pessoa ou estabelecimento</option>
            </Select>
          </label>
          {agent === 'new' && (
            <label>
              Nome da pessoa ou estabelecimento
              <input
                required
                maxLength={150}
                value={name}
                onChange={(e) => onName(e.target.value)}
                placeholder="Supermercado ABC"
              />
            </label>
          )}
          {agent && (
            <div className="form-stack">
              {sourceKind !== 'settlement' && (
                <ToggleField checked={rememberIdentity} onChange={onRememberIdentity}>
                  Reconhecer esta descrição nesta conta
                </ToggleField>
              )}
              {category && (
                <ToggleField checked={remember} onChange={onRemember}>
                  Usar esta categoria em lançamentos do mesmo tipo
                </ToggleField>
              )}
            </div>
          )}
          <Link className="text-button" to="/counterparties">
            Gerenciar cadastros
          </Link>
          {children}
          {query.isError && (
            <p className="form-error">
              Não foi possível carregar as pessoas e estabelecimentos. Você pode salvar o lançamento
              sem criar uma regra.
            </p>
          )}
        </div>
      </details>
    </>
  );
}
