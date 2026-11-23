import { HelpTip } from '../../shared/ui/tooltip';
import { useState } from 'react';
import '../goals/goals.css';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { components } from '../../shared/api/generated';
import { request } from '../../shared/api/client';
import { useFinanceWrite } from '../../shared/api/use-finance-write';
import { PageHeader } from '../../shared/ui/page-header';
import { EmptyState, Button, Loading, ErrorState, Modal } from '../../shared/ui/primitives';
import { FinanceForm } from '../../shared/ui/finance-forms';
import { money, shortDate } from '../../shared/formatting/money';
type Queue = components['schemas']['RecognitionQueueDto'];
type Preview = components['schemas']['RecognitionPreviewDto'];
type Change = { id: string; transactionId: string; createdAt: string; undoneAt: string | null };
export function RecognitionPage() {
  const query = useQuery({
      queryKey: ['recognition'],
      queryFn: () => request<Queue>('/recognition'),
    }),
    changes = useQuery({
      queryKey: ['recognition-changes'],
      queryFn: () => request<Change[]>('/recognition/changes'),
    });
  const write = useFinanceWrite(),
    [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState('');
  async function action(path: string, body?: unknown) {
    setError('');
    try {
      await write(path, body);
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar a revisão.');
    }
  }
  return (
    <div className="page-enter recognition-page">
      <PageHeader
        route
        title="Revisão assistida"
        description="Revise sugestões de categoria, identificação e pagamento."
      />
      <HelpTip
        label="Como funciona a revisão"
        text="A revisão inclui até 500 lançamentos sem categoria e preserva escolhas manuais."
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <div className="inline-actions">
            <Button
              disabled={!selected.length}
              onClick={async () => {
                setError('');
                try {
                  setPreview(
                    await write<Preview>('/recognition/preview', { signatures: selected }),
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Não foi possível preparar a revisão.');
                }
              }}
            >
              Revisar {selected.length} escolha(s)
            </Button>
            <Button
              className="secondary"
              disabled={!selected.length}
              onClick={() => void action('/recognition/reject', { signatures: selected })}
            >
              Rejeitar sugestões
            </Button>
          </div>
          {!query.data.items.length && <EmptyState title="Nenhuma sugestão pendente" compact />}
          {query.data.items.map((item) => (
            <article className="goal-record" key={item.signature}>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={selected.includes(item.signature)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [
                            ...selected.filter(
                              (s) =>
                                !query.data.items.some(
                                  (i) =>
                                    i.signature === s && i.transactionId === item.transactionId,
                                ),
                            ),
                            item.signature,
                          ]
                        : selected.filter((s) => s !== item.signature),
                    )
                  }
                />
                <strong>
                  {item.description} · {money(item.amount)}
                </strong>
              </label>
              <p>
                {item.accountName} · {shortDate(item.date)}
              </p>
              <p>
                {item.cardName
                  ? `Pagamento: ${item.cardName} · ${item.billMonth}`
                  : `${item.counterpartyName ?? 'Manter identificação'}${item.categoryName ? ` → ${item.categoryName}` : ''}`}
              </p>
              <p className="field-help">{item.explanation}</p>
            </article>
          ))}
        </>
      )}
      <details className="finance-disclosure">
        <summary>Alterações recentes e desfazer</summary>
        <p className="field-help">
          Desfaça pagamentos em Cartões. Aqui, alterações só podem ser desfeitas antes de uma nova
          edição.
        </p>
        {changes.data?.map((c) => (
          <div key={c.id} className="goal-event">
            <Link to="/transactions">Ver lançamento</Link>
            <time>{new Date(c.createdAt).toLocaleDateString('pt-BR')}</time>
            {c.undoneAt ? (
              <span>Desfeito</span>
            ) : (
              <button
                className="text-button"
                onClick={() => void action(`/recognition/changes/${c.id}/undo`)}
              >
                Desfazer alteração
              </button>
            )}
          </div>
        ))}
      </details>
      <Modal
        open={preview !== null}
        onOpenChange={(o) => !o && setPreview(null)}
        title="Conferir alterações"
      >
        {preview && (
          <FinanceForm
            label="Confirmar lote"
            onSubmit={async () => {
              await write(`/recognition/${preview.id}/confirm`);
              setPreview(null);
              setSelected([]);
            }}
          >
            <p>Nenhuma regra nova será aprendida automaticamente.</p>
            {preview.items.map((i) => (
              <div key={i.signature}>
                <strong>
                  {i.description} · {money(i.amount)}
                </strong>
                <p>
                  {i.cardName
                    ? `Vincular a ${i.cardName} (${i.billMonth})`
                    : `${i.counterpartyName ?? 'Identificação mantida'}${i.categoryName ? ` · categoria ${i.categoryName}` : ''}`}
                </p>
                <p className="field-help">{i.explanation}</p>
              </div>
            ))}
          </FinanceForm>
        )}
      </Modal>
    </div>
  );
}
