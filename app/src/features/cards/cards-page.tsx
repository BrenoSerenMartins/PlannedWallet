import { cardHudArtwork } from './art/catalog';
import '../../shared/ui/card-invoice-preview.css';
import { useFinancialVisibility } from '../../shared/privacy/financial-visibility';
import { MonthPicker } from '../../shared/ui/controls/month-picker';
import { HelpTip, Tooltip } from '../../shared/ui/tooltip';
import { useNotifications } from '../../shared/feedback/notification-provider';
import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard as CreditIcon,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { request } from '../../shared/api/client';
import { useFinanceWrite } from '../../shared/api/use-finance-write';
import type {
  CardsSummary,
  CardEntry,
  CardPayment,
  CardPurchase,
} from '../../shared/api/resources';
import { Button, ErrorState, Loading, Modal } from '../../shared/ui/primitives';
import {
  FinanceForm,
  useFinanceChoices,
  FinanceChoices,
  moneyInput,
} from '../../shared/ui/finance-forms';
import { CategorySelect } from '../../shared/ui/category-select';
import { dateToday, money, parseMoney, shortDate } from '../../shared/formatting/money';
import { validMonth, shiftMonth } from '../../shared/formatting/month';
import { CardForm, CardPurchaseForm, CardOpeningForm } from './components/card-forms';
import { CardPaymentForm } from './components/card-payment-form';
import { CardRecurring } from './components/card-recurring';
import './cards.css';
type Dialog =
  | { kind: 'new' | 'edit' | 'purchase' | 'opening' | 'pay' | 'delete' | 'billTotal' }
  | { kind: 'refund' | 'undoRefund' | 'undoOpening'; entry: CardEntry }
  | { kind: 'undoPayment'; payment: CardPayment }
  | { kind: 'category' | 'cancelPurchase'; purchase: CardPurchase };
const states = { open: 'Em aberto', closed: 'Fechada', overdue: 'Vencida', paid: 'Sem pendência' };
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'short' })
    .format(new Date(`${month}-01T12:00:00`))
    .replace('.', '');
export function CardsPage() {
  const [params, setParams] = useSearchParams();
  const month = validMonth(params.get('month')) ? params.get('month')! : dateToday().slice(0, 7);
  const query = useQuery({
    queryKey: ['cards'],
    queryFn: () => request<CardsSummary>('/cards'),
  });
  const write = useFinanceWrite();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const { visible } = useFinancialVisibility();
  const [showArchived, setShowArchived] = useState(false);
  const billTotalInput = useRef<HTMLInputElement>(null);
  const selectorRef = useRef<HTMLDivElement>(null);
  const swipeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { success: setMessage } = useNotifications();
  const value = (n: number) => (visible ? money(n) : '••••••');
  const all = query.data?.cards ?? [];
  const cards = all.filter((c) => showArchived || !c.archived);
  const card = cards.find((c) => c.id === params.get('card')) ?? cards[0];
  const bill = card?.bills.find((b) => b.month === month);
  const billTotalAction = card && !card.archived && (
    <Tooltip
      text={bill?.imported ? 'Total definido pela fatura importada' : 'Editar total da fatura'}
    >
      <button
        type="button"
        className="icon-button card-bill-edit"
        aria-label="Editar total da fatura"
        aria-disabled={bill?.imported || undefined}
        onClick={() => setDialog({ kind: 'billTotal' })}
      >
        <Pencil size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  );
  const activeEntries = bill?.entries.filter((entry) => entry.active) ?? [];
  const activePurchaseIds = new Set(
    activeEntries.filter((entry) => entry.kind === 'purchase').map((entry) => entry.purchaseId),
  );
  const cyclePurchases =
    card?.purchases.filter((purchase) => activePurchaseIds.has(purchase.id)) ?? [];
  useEffect(() => {
    if (params.get('action') !== 'pay' || !card || card.id !== params.get('card') || !bill) return;
    setDialog({ kind: 'pay' });
    const next = new URLSearchParams(params);
    next.delete('action');
    setParams(next, { replace: true });
  }, [params, card, bill, setParams]);
  const update = (changes: Record<string, string>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [key, val] of Object.entries(changes)) next.set(key, val);
    setParams(next, { replace });
  };
  useEffect(() => {
    const selector = selectorRef.current;
    if (!selector || !card || window.matchMedia('(min-width: 851px)').matches) return;
    const selected = Array.from(
      selector.querySelectorAll<HTMLButtonElement>('[data-card-id]'),
    ).find((item) => item.dataset.cardId === card.id);
    if (selected) {
      selector.scrollTo({
        left:
          selector.scrollLeft +
          selected.getBoundingClientRect().left -
          selector.getBoundingClientRect().left -
          (selector.clientWidth - selected.offsetWidth) / 2,
        behavior: 'smooth',
      });
    }
  }, [card?.id, cards.length]);
  useEffect(
    () => () => {
      if (swipeTimer.current) clearTimeout(swipeTimer.current);
    },
    [],
  );
  const saved = (newMonth?: string) => {
    setDialog(null);
    setMessage('Registro salvo. Faturas, relatórios e previsão foram atualizados.');
    if (newMonth) update({ month: newMonth });
  };
  return (
    <div className="page-enter cards-page">
      <section className="card-directory-surface" aria-label="Cartões cadastrados">
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <>
            {all.some((card) => card.archived) && (
              <div className="card-directory-filters">
                {' '}
                <label className="finance-checkbox">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  Mostrar cartões arquivados
                </label>
              </div>
            )}
            {!cards.length ? (
              <div className="card-directory-empty">
                <span className="card-empty-symbol" aria-hidden="true">
                  <CreditIcon size={30} strokeWidth={1.5} />
                </span>
                <h2>{all.length ? 'Nenhum cartão ativo' : 'Seu primeiro cartão começa aqui'}</h2>
                <p>
                  {all.length
                    ? 'Ative Mostrar cartões arquivados para consultar seu histórico.'
                    : 'Cadastre seu cartão para acompanhar faturas, parcelas e limite disponível.'}
                </p>
                {!all.length && (
                  <Button
                    className="compact"
                    onClick={() => setDialog({ kind: 'new' })}
                    disabled={!navigator.onLine}
                  >
                    <Plus size={16} /> Novo cartão
                  </Button>
                )}
              </div>
            ) : (
              <div className="cards-workspace">
                <div
                  ref={selectorRef}
                  className="credit-selector no-scrollbar"
                  role="group"
                  aria-label="Escolher cartão"
                  onScroll={() => {
                    if (window.matchMedia('(min-width: 851px)').matches) return;
                    if (swipeTimer.current) clearTimeout(swipeTimer.current);
                    swipeTimer.current = setTimeout(() => {
                      const selector = selectorRef.current;
                      if (!selector) return;
                      const center =
                        selector.getBoundingClientRect().left + selector.clientWidth / 2;
                      const nearest = Array.from(
                        selector.querySelectorAll<HTMLButtonElement>('[data-card-id]'),
                      ).reduce<HTMLButtonElement | null>((closest, item) => {
                        if (!closest) return item;
                        const distance = Math.abs(
                          item.getBoundingClientRect().left + item.offsetWidth / 2 - center,
                        );
                        const closestDistance = Math.abs(
                          closest.getBoundingClientRect().left + closest.offsetWidth / 2 - center,
                        );
                        return distance < closestDistance ? item : closest;
                      }, null);
                      const id = nearest?.dataset.cardId;
                      if (id && id !== card?.id) update({ card: id }, true);
                    }, 100);
                  }}
                >
                  {cards.map((c) => {
                    const art = cardHudArtwork(c.name, c.artwork);
                    const invoiceTotal = value(
                      c.bills.find((item) => item.month === month)?.total ?? 0,
                    );
                    return (
                      <div className="credit-card-frame physical-card-frame" key={c.id}>
                        <button
                          type="button"
                          className="physical-card-picker"
                          aria-label={c.name}
                          data-card-id={c.id}
                          aria-pressed={c.id === card?.id}
                          onClick={() => update({ card: c.id })}
                        >
                          <span className="physical-card-face">
                            {art ? (
                              <img
                                src={art.src}
                                decoding="async"
                                loading={c.id === card?.id ? 'eager' : 'lazy'}
                                alt={art.illustrative ? 'Arte padrão do emissor' : art.label}
                              />
                            ) : (
                              <span className="physical-card-default" aria-hidden="true">
                                <span>PlannedWallet</span>
                                <span className="physical-card-default-chip" />
                                <CreditIcon size={24} />
                              </span>
                            )}
                          </span>
                        </button>
                        <div className="physical-card-caption">
                          <div className="physical-card-caption-heading">
                            <strong>
                              {c.name}
                              {c.archived ? ' · Arquivado' : ''}
                            </strong>
                            {c.id === card?.id && (
                              <Tooltip text="Editar cartão">
                                <button
                                  type="button"
                                  className="physical-card-edit icon-button"
                                  aria-label="Editar cartão"
                                  onClick={() => setDialog({ kind: 'edit' })}
                                  disabled={!navigator.onLine}
                                >
                                  <Pencil size={16} />
                                </button>
                              </Tooltip>
                            )}
                          </div>
                          <span>
                            Fatura do mês <strong>{invoiceTotal}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="credit-card-frame credit-card-frame-new physical-card-frame">
                    <button
                      type="button"
                      className="credit-card-new physical-card-face"
                      onClick={() => setDialog({ kind: 'new' })}
                      disabled={!navigator.onLine}
                    >
                      <Plus size={22} aria-hidden="true" />
                      <strong>Novo cartão</strong>
                    </button>
                  </div>
                </div>
                {card && (
                  <section className="card-detail">
                    <div className="card-bill-toolbar">
                      <p className="selected-card-metadata">
                        Fecha dia {card.closingDay} <span aria-hidden="true">·</span> vence dia{' '}
                        {card.dueDay}
                      </p>
                      <div className="inline-actions">
                        <Button
                          className="compact"
                          disabled={card.archived || !navigator.onLine}
                          onClick={() => setDialog({ kind: 'purchase' })}
                        >
                          <Plus size={15} /> Compra
                        </Button>
                        <Button
                          className="secondary compact"
                          disabled={card.archived || !navigator.onLine}
                          onClick={() => setDialog({ kind: 'opening' })}
                        >
                          Dívida anterior
                        </Button>
                        <Link className="button secondary compact" to="/imports">
                          Importar extratos e faturas
                        </Link>
                      </div>
                    </div>
                    {card.limit > 0 &&
                      (() => {
                        const current = Math.max(0, bill?.remaining ?? 0);
                        const future = card.bills
                          .filter((item) => item.month > month)
                          .reduce((total, item) => total + Math.max(0, item.remaining), 0);
                        const total = Math.max(1, card.limit);
                        const currentWidth = Math.min(100, (current / total) * 100);
                        const futureWidth = Math.min(100 - currentWidth, (future / total) * 100);
                        return (
                          <div className="card-limit-overview">
                            <div className="card-limit-heading">
                              <span>Limite cadastrado</span>
                              <strong>{value(card.limit)}</strong>
                            </div>
                            <div
                              className="card-limit-bar"
                              role="img"
                              aria-label={`Fatura do mês ${value(current)}, faturas futuras ${value(future)}, disponível ${value(card.availableLimit)}`}
                            >
                              <span style={{ width: `${currentWidth}%` }} />
                              <span style={{ width: `${futureWidth}%` }} />
                            </div>
                            <div className="card-limit-legend">
                              <span>
                                <i className="current" />
                                <span>
                                  Mês<strong>{value(current)}</strong>
                                </span>
                              </span>
                              <span>
                                <i className="future" />
                                <span>
                                  Futuras<strong>{value(future)}</strong>
                                </span>
                              </span>
                              <span>
                                <i className="available" />
                                <span>
                                  Disponível<strong>{value(card.availableLimit)}</strong>
                                </span>
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    {(() => {
                      const sixMonths = Array.from({ length: 6 }, (_, index) =>
                        shiftMonth(month, index - 5),
                      );
                      const average =
                        card.bills
                          .filter((item) => sixMonths.includes(item.month))
                          .reduce((total, item) => total + item.total, 0) / 6;
                      const percent =
                        card.limit > 0
                          ? Math.min(100, Math.round((card.debt / card.limit) * 100))
                          : null;
                      const closingDate = bill?.closingDate
                        ? new Date(`${bill.closingDate}T12:00:00`)
                        : new Date(`${month}-01T12:00:00`);
                      if (!bill?.closingDate) closingDate.setDate(card.closingDay + 1);
                      else closingDate.setDate(closingDate.getDate() + 1);
                      return (
                        <div className="card-hud-tiles">
                          <article>
                            <span>Melhor dia de compra</span>
                            <strong>Dia {closingDate.getDate()}</strong>
                            <small>Após fechamento</small>
                          </article>
                          <article>
                            <span>Média mensal · 6 meses</span>
                            <strong>{value(average)}</strong>
                            <small>{percent === null ? 'Sem limite' : `${percent}% usado`}</small>
                          </article>
                          <article className="card-committed-tile">
                            <span>Total comprometido</span>
                            <strong>{value(card.debt)}</strong>
                            <small>Saldo devedor do cartão</small>
                          </article>
                        </div>
                      );
                    })()}
                    <section className="card-projection" aria-label="Projeção de faturas">
                      <div className="card-projection-heading">
                        <h3>Projeção de faturas</h3>
                        <div className="finance-month-navigation card-projection-month-nav">
                          <Tooltip text="Fatura anterior">
                            <button
                              className="icon-button"
                              aria-label="Fatura anterior"
                              disabled={month === '1900-01'}
                              onClick={() => update({ month: shiftMonth(month, -1) })}
                            >
                              <ChevronLeft size={18} />
                            </button>
                          </Tooltip>
                          <label className="period-picker">
                            <span>Mês de vencimento</span>
                            <MonthPicker
                              clearable={false}
                              aria-label="Mês da fatura"
                              min="1900-01"
                              max="9998-12"
                              value={month}
                              onChange={(e) => e.target.value && update({ month: e.target.value })}
                            />
                          </label>
                          <Tooltip text="Próxima fatura">
                            <button
                              className="icon-button"
                              aria-label="Próxima fatura"
                              disabled={month === '9998-12'}
                              onClick={() => update({ month: shiftMonth(month, 1) })}
                            >
                              <ChevronRight size={18} />
                            </button>
                          </Tooltip>
                        </div>
                        {card.limit > 0 && (
                          <span className="card-limit-caption">Limite {value(card.limit)}</span>
                        )}
                      </div>
                      {(() => {
                        const projection = Array.from({ length: 8 }, (_, index) => {
                          const projectionMonth = shiftMonth(month, index);
                          return (
                            card.bills.find((item) => item.month === projectionMonth) ?? {
                              month: projectionMonth,
                              total: 0,
                            }
                          );
                        });
                        const max = Math.max(0, ...projection.map((item) => item.total));
                        return projection.length ? (
                          <div
                            className="card-projection-chart no-scrollbar"
                            aria-label="Faturas dos próximos meses"
                          >
                            {projection.map((item) => {
                              const active = item.month === month;
                              const height = max > 0 ? Math.max(8, (item.total / max) * 100) : 8;
                              return (
                                <button
                                  type="button"
                                  key={item.month}
                                  className={`card-projection-month${active ? ' selected' : ''}`}
                                  aria-pressed={active}
                                  aria-label={`${monthLabel(item.month)} ${item.month.slice(0, 4)}, fatura ${value(item.total)}`}
                                  onClick={() => update({ month: item.month })}
                                >
                                  <strong>{value(item.total)}</strong>
                                  <span className="card-projection-track">
                                    <i style={{ height: `${height}%` }} />
                                  </span>
                                  <span>{monthLabel(item.month)}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="card-projection-empty">Sem faturas futuras</p>
                        );
                      })()}
                    </section>
                    {bill ? (
                      <>
                        <div className="card-bill-stats">
                          <div>
                            <span>Total da fatura {billTotalAction}</span>
                            <strong>{value(bill.total)}</strong>
                          </div>
                          <div>
                            <span>Pagamentos</span>
                            <strong>{value(bill.paid)}</strong>
                          </div>
                          <div>
                            <span>
                              Créditos aplicados
                              <HelpTip
                                label="Créditos aplicados na fatura"
                                text="Créditos de devoluções ou de outras faturas podem abater esta cobrança. O valor aplicado já está considerado no saldo a pagar."
                              />
                            </span>
                            <strong>{value(bill.creditApplied)}</strong>
                          </div>
                          <div>
                            <span>A pagar</span>
                            <strong className={bill.remaining > 0 ? 'negative' : ''}>
                              {value(bill.remaining)}
                            </strong>
                          </div>
                        </div>
                        <div className="card-bill-status">
                          <span className={`bill-state state-${bill.state}`}>
                            {states[bill.state]}
                          </span>
                          <span>
                            Fechamento {shortDate(bill.closingDate)} · vencimento{' '}
                            {shortDate(bill.dueDate)}
                          </span>
                          {bill.remaining > 0 && (
                            <Button
                              className="compact"
                              disabled={!navigator.onLine}
                              onClick={() => setDialog({ kind: 'pay' })}
                            >
                              Pagar ou vincular
                            </Button>
                          )}
                        </div>
                        <h3 className="card-entries-heading">
                          Lançamentos na fatura · {activeEntries.length}
                        </h3>
                        <ul className="card-entry-list">
                          {activeEntries.map((entry) => (
                            <li key={entry.id}>
                              <div>
                                <CreditIcon size={15} aria-hidden="true" />
                                <strong>
                                  {card.purchases.find((item) => item.id === entry.purchaseId)
                                    ?.description ?? entry.description}
                                </strong>
                                <span>
                                  {entry.kind === 'opening'
                                    ? 'Dívida anterior'
                                    : entry.kind === 'invoice_adjustment'
                                      ? entry.description === 'Ajuste manual da fatura'
                                        ? 'Ajuste manual'
                                        : 'Ajuste da fatura importada'
                                      : entry.kind === 'refund'
                                        ? 'Estorno'
                                        : (() => {
                                            const purchase = card.purchases.find(
                                              (item) => item.id === entry.purchaseId,
                                            );
                                            return purchase && entry.installmentNumber
                                              ? `Parcela ${entry.installmentNumber}/${purchase.installments}`
                                              : 'Despesa da fatura';
                                          })()}
                                </span>
                              </div>
                              <strong className={entry.amount > 0 ? 'positive' : ''}>
                                {value(Math.abs(entry.amount))}
                                {entry.amount > 0 ? ' de crédito' : ''}
                              </strong>
                              {entry.active && entry.kind === 'purchase' && (
                                <button
                                  className="text-button"
                                  onClick={() => setDialog({ kind: 'refund', entry })}
                                >
                                  Estornar
                                </button>
                              )}
                              {entry.active && entry.kind === 'refund' && (
                                <button
                                  className="text-button"
                                  onClick={() => setDialog({ kind: 'undoRefund', entry })}
                                >
                                  Desfazer estorno
                                </button>
                              )}
                              {entry.active && entry.kind === 'opening' && (
                                <button
                                  className="text-button"
                                  onClick={() => setDialog({ kind: 'undoOpening', entry })}
                                >
                                  Corrigir dívida anterior
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                        {!!bill.payments.length && (
                          <details className="finance-disclosure">
                            <summary>Pagamentos e vínculos · {bill.payments.length}</summary>
                            <ul className="card-entry-list">
                              {bill.payments.map((p) => (
                                <li key={p.id}>
                                  <div>
                                    <strong>
                                      {p.mode === 'link'
                                        ? 'Vinculado ao extrato'
                                        : 'Pagamento registrado'}
                                    </strong>
                                    <span>
                                      {shortDate(p.paymentDate)} ·{' '}
                                      {p.voided
                                        ? 'Desfeito'
                                        : p.active
                                          ? 'Ativo'
                                          : 'Revisão necessária'}
                                    </span>
                                  </div>
                                  <strong>{value(p.amount)}</strong>
                                  {!p.voided && (
                                    <button
                                      className="text-button"
                                      onClick={() => setDialog({ kind: 'undoPayment', payment: p })}
                                    >
                                      {p.mode === 'link' ? 'Desvincular' : 'Desfazer registro'}
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="card-empty-line">
                        Nenhuma compra neste vencimento {billTotalAction}
                      </p>
                    )}
                    {!!cyclePurchases.length && (
                      <details className="finance-disclosure card-purchases-disclosure">
                        <summary>
                          <span>Compras e parcelamentos · {cyclePurchases.length}</span>
                          <ChevronDown size={17} aria-hidden="true" />
                        </summary>
                        <ul className="card-entry-list card-purchase-list">
                          {cyclePurchases.map((p) => (
                            <li key={p.id}>
                              <div className="purchase-mainline">
                                <strong>{p.description}</strong>
                                {p.installments > 1 &&
                                  (() => {
                                    const installment = bill?.entries.find(
                                      (entry) => entry.purchaseId === p.id && entry.active,
                                    )?.installmentNumber;
                                    return (
                                      <span className="purchase-installment">
                                        {installment
                                          ? `${installment}/${p.installments}`
                                          : `${p.installments}x`}
                                      </span>
                                    );
                                  })()}
                              </div>
                              <strong className="purchase-amount">{value(p.amount)}</strong>
                              <div className="purchase-subline">
                                <span>{shortDate(p.purchaseDate)}</span>
                                {!p.canceled && (
                                  <div className="inline-actions">
                                    <button
                                      className="text-button"
                                      onClick={() => setDialog({ kind: 'category', purchase: p })}
                                    >
                                      Categoria
                                    </button>
                                    <button
                                      className="icon-button purchase-cancel-button"
                                      aria-label={`Cancelar compra ${p.description}`}
                                      title="Cancelar compra"
                                      onClick={() =>
                                        setDialog({ kind: 'cancelPurchase', purchase: p })
                                      }
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </section>
      {card && !card.archived && <CardRecurring key={card.id} card={card} month={month} />}
      <Modal
        open={!!dialog}
        onOpenChange={(open) => !open && setDialog(null)}
        title={
          dialog?.kind === 'billTotal'
            ? 'Total da fatura'
            : dialog?.kind === 'new'
              ? 'Novo cartão'
              : dialog?.kind === 'delete'
                ? 'Excluir cartão'
                : dialog?.kind === 'edit'
                  ? 'Editar cartão'
                  : dialog?.kind === 'purchase'
                    ? 'Compra no cartão'
                    : dialog?.kind === 'pay'
                      ? 'Pagamento da fatura'
                      : dialog?.kind === 'opening'
                        ? 'Dívida anterior'
                        : dialog?.kind === 'refund'
                          ? 'Estorno no cartão'
                          : dialog?.kind === 'category'
                            ? 'Categoria da compra'
                            : 'Revisar correção'
        }
        description="Confira os valores antes de confirmar."
      >
        {dialog?.kind === 'billTotal' &&
          card &&
          (bill?.imported ? (
            <p>Esta fatura foi importada. Para corrigir o total, importe a fatura atualizada.</p>
          ) : (
            <FinanceForm
              label="Salvar total"
              onSubmit={async () => {
                await write(
                  `/cards/${card.id}/bills/${month}/total`,
                  { total: parseMoney(billTotalInput.current?.value ?? '') },
                  card.version,
                  'PATCH',
                );
                saved();
                setMessage('Total da fatura atualizado.');
              }}
            >
              <label>
                Total da fatura (R$)
                <input
                  ref={billTotalInput}
                  required
                  inputMode="decimal"
                  maxLength={20}
                  defaultValue={moneyInput(bill?.total ?? 0)}
                />
              </label>
            </FinanceForm>
          ))}
        {dialog?.kind === 'new' && <CardForm write={write} onSaved={() => saved()} />}
        {dialog?.kind === 'edit' && card && (
          <>
            <CardForm card={card} write={write} onSaved={() => saved()} />
            <Button
              type="button"
              className="secondary"
              onClick={() => setDialog({ kind: 'delete' })}
            >
              <Trash2 size={16} /> Excluir cartão
            </Button>
          </>
        )}
        {dialog?.kind === 'delete' && card && (
          <FinanceForm
            label="Excluir definitivamente"
            onSubmit={async () => {
              await write(`/cards/${card.id}`, undefined, card.version, 'DELETE');
              saved();
            }}
          >
            <p>
              Excluir <strong>{card.name}</strong> remove suas faturas, compras, parcelas e
              importações do histórico. Pagamentos lançados na conta bancária continuam no extrato.
            </p>
            <p>Esta ação não pode ser desfeita.</p>
          </FinanceForm>
        )}
        {dialog?.kind === 'purchase' && card && (
          <CardPurchaseForm card={card} write={write} onSaved={saved} />
        )}
        {dialog?.kind === 'opening' && card && (
          <CardOpeningForm card={card} month={month} write={write} onSaved={() => saved()} />
        )}
        {dialog?.kind === 'pay' && card && bill && (
          <CardPaymentForm card={card} bill={bill} write={write} onSaved={() => saved()} />
        )}
        {dialog?.kind === 'category' && card && (
          <PurchaseCategory
            cardId={card.id}
            version={card.version}
            purchase={dialog.purchase}
            write={write}
            onSaved={() => saved()}
          />
        )}
        {dialog?.kind === 'refund' && card && (
          <RefundForm
            cardId={card.id}
            version={card.version}
            entry={dialog.entry}
            month={month}
            write={write}
            onSaved={() => saved()}
          />
        )}
        {card &&
          dialog &&
          ['cancelPurchase', 'undoPayment', 'undoRefund', 'undoOpening'].includes(dialog.kind) && (
            <FinanceForm
              label="Confirmar correção"
              onSubmit={async () => {
                if (dialog.kind === 'cancelPurchase')
                  await write(
                    `/cards/${card.id}/purchases/${dialog.purchase.id}/reversal`,
                    undefined,
                    card.version,
                  );
                if (dialog.kind === 'undoPayment')
                  await write(
                    `/cards/${card.id}/payments/${dialog.payment.id}/reversal`,
                    undefined,
                    card.version,
                  );
                if (dialog.kind === 'undoRefund')
                  await write(
                    `/cards/${card.id}/refunds/${dialog.entry.id}/reversal`,
                    undefined,
                    card.version,
                  );
                if (dialog.kind === 'undoOpening')
                  await write(
                    `/cards/${card.id}/opening/${dialog.entry.id}/reversal`,
                    undefined,
                    card.version,
                  );
                saved();
              }}
            >
              <p>
                {dialog.kind === 'undoPayment'
                  ? dialog.payment.mode === 'link'
                    ? 'A saída do extrato será preservada como transferência sem vínculo, e a fatura será reaberta. Vincule a saída à fatura correta em seguida.'
                    : 'Desfaz as duas pontas do pagamento registrado, devolvendo o valor ao saldo da conta e reabrindo a fatura.'
                  : dialog.kind === 'cancelPurchase'
                    ? 'Cancela as parcelas desta compra, preservando o histórico da correção. Compras com pagamentos ou estornos devem ser revisadas antes.'
                    : dialog.kind === 'undoOpening'
                      ? 'Remove a dívida anterior registrada incorretamente. Se houver pagamentos, revise os vínculos antes de corrigir a dívida.'
                      : 'Desfaz o crédito deste estorno, restaurando o valor pendente nas faturas.'}
              </p>
            </FinanceForm>
          )}
      </Modal>
    </div>
  );
}

function PurchaseCategory({
  cardId,
  version,
  purchase,
  write,
  onSaved,
}: {
  cardId: string;
  version: number;
  purchase: CardPurchase;
  write: ReturnType<typeof useFinanceWrite>;
  onSaved: () => void;
}) {
  const choices = useFinanceChoices();
  const [category, setCategory] = useState(purchase.categoryId ?? '');
  return (
    <FinanceChoices accounts={choices.accounts} categories={choices.categories}>
      <FinanceForm
        label="Salvar categoria"
        onSubmit={async () => {
          await write(
            `/cards/${cardId}/purchases/${purchase.id}/category`,
            { categoryId: category || null },
            version,
            'PATCH',
          );
          onSaved();
        }}
      >
        <p>
          Altera a categoria de todas as parcelas e dos estornos vinculados, sem mudar valores ou
          pagamentos.
        </p>
        <label>
          Categoria
          <CategorySelect
            categories={choices.categories.data ?? []}
            type="expense"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
      </FinanceForm>
    </FinanceChoices>
  );
}
function RefundForm({
  cardId,
  version,
  entry,
  month,
  write,
  onSaved,
}: {
  cardId: string;
  version: number;
  entry: CardEntry;
  month: string;
  write: ReturnType<typeof useFinanceWrite>;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(moneyInput(Math.abs(entry.amount)));
  const [billMonth, setMonth] = useState(month);
  return (
    <FinanceForm
      label="Registrar estorno"
      onSubmit={async () => {
        await write(
          `/cards/${cardId}/refunds`,
          { entryId: entry.id, billMonth, amount: parseMoney(amount) },
          version,
        );
        onSaved();
      }}
    >
      <p>{entry.description}</p>
      <label>
        Crédito do estorno (R$)
        <input
          required
          inputMode="decimal"
          maxLength={20}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <label>
        Fatura que recebeu o crédito
        <MonthPicker
          required
          min={entry.billMonth}
          max="9998-12"
          value={billMonth}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>
      <p className="field-help">
        Informe o crédito desta parcela. Estornos já registrados contam no limite devolvido. A
        categoria original será preservada e a despesa reduzida.
      </p>
    </FinanceForm>
  );
}
