import { PlanningCardBills } from './components/planning-card-bills';
import { MonthPicker } from '../../shared/ui/controls/month-picker';
import { ActionMenu } from '../../shared/ui/action-menu';
import type { ReactNode } from 'react';
import { useNotifications } from '../../shared/feedback/notification-provider';
import { BenefitPlanningNotice } from './components/benefit-planning-notice';
import { CommitmentsPage } from './commitments-page';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { validMonth, shiftMonth } from '../../shared/formatting/month';
import { Copy, Pencil, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { dateToday } from '../../shared/formatting/money';
import { ErrorState, Loading, Modal } from '../../shared/ui/primitives';
import { useMonthlyPlan, usePreviousMonthlyPlan } from './hooks/use-monthly-plan';
import { PlanningSummary } from './components/planning-summary';
import { BudgetSection } from './components/budget-section';
import { PlanForm } from './components/plan-form';
import { CopyPlanDialog } from './components/copy-plan-dialog';
import './planning.css';
export function PlanningPage() {
  const [params] = useSearchParams();
  const view = params.get('view') === 'commitments' ? 'commitments' : 'budget';
  const navigation =
    view === 'commitments' ? (
      <Link
        className="text-button"
        to={`/planning${params.get('month') ? '?month=' + params.get('month') : ''}`}
      >
        ← Voltar ao planejamento
      </Link>
    ) : undefined;
  return (
    <div className="planning-workspace">
      {view === 'commitments' ? (
        <CommitmentsPage navigation={navigation} />
      ) : (
        <MonthlyBudgetPage navigation={navigation} />
      )}
    </div>
  );
}
function MonthlyBudgetPage({ navigation }: { navigation?: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const requestedMonth = params.get('month');
  const month = validMonth(requestedMonth) ? requestedMonth : dateToday().slice(0, 7);
  const setMonth = (value: string) => {
    if (validMonth(value)) setParams({ month: value });
  };
  const [dialog, setDialog] = useState<'edit' | 'copy' | null>(null);
  const { success: setMessage } = useNotifications();
  const { query, save, copy } = useMonthlyPlan(month);
  const { available: canCopyPrevious } = usePreviousMonthlyPlan(month);
  const plan = query.data;
  function saved() {
    setDialog(null);
    setMessage('Planejamento salvo. Seus lançamentos e saldos foram preservados.');
  }
  return (
    <div className="page-enter planning-page">
      <h1 className="sr-only">Planejamento mensal</h1>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        plan && (
          <>
            <header className="future-page-heading">
              <h1>Visão futura</h1>
              <div className="future-page-controls">
                <div className="future-month-navigation" aria-label="Navegar entre meses">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Mês anterior"
                    disabled={month === '1900-01'}
                    onClick={() => setMonth(shiftMonth(month, -1))}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <label className="period-picker">
                    <span className="sr-only">Mês do plano</span>
                    <MonthPicker
                      clearable={false}
                      aria-label="Mês do planejamento"
                      min="1900-01"
                      max="9998-12"
                      value={month}
                      onChange={(e) => {
                        if (e.target.value) {
                          setMonth(e.target.value);
                          setMessage('');
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Próximo mês"
                    disabled={month === '9998-12'}
                    onClick={() => setMonth(shiftMonth(month, 1))}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
                <ActionMenu label="Mais ações do planejamento">
                  <Link to={`/planning?view=commitments&month=${month}`}>
                    Agenda de compromissos
                  </Link>
                  <button
                    type="button"
                    disabled={!navigator.onLine}
                    onClick={() => setDialog('edit')}
                  >
                    <Pencil size={16} />
                    {plan.version ? 'Editar planejamento' : 'Preparar meu mês'}
                  </button>
                  {canCopyPrevious && (
                    <button
                      type="button"
                      disabled={!navigator.onLine}
                      onClick={() => setDialog('copy')}
                    >
                      <Copy size={16} />
                      Copiar mês anterior
                    </button>
                  )}
                </ActionMenu>
              </div>
            </header>
            <PlanningSummary
              plan={plan}
              navigation={navigation}
              onEditPlan={() => setDialog('edit')}
              commitments={<PlanningCardBills plan={plan} />}
            />
            {plan.totals.missingCategoryCount > 0 && (
              <div className="review-banner planning-included">
                <strong>{plan.totals.missingCategoryCount} itens em Outros</strong>
                <Link to="/transactions">
                  Organizar <ArrowRight size={14} />
                </Link>
              </div>
            )}
            {plan.totals.unclassifiedCount > 0 && (
              <div className="review-banner planning-included planning-unclassified">
                <strong>{plan.totals.unclassifiedCount} movimentos para revisar</strong>
                <Link to="/transactions?type=unclassified">
                  Revisar <ArrowRight size={14} />
                </Link>
              </div>
            )}
            <div className="planning-sections">
              <BudgetSection type="income" lines={plan.lines.filter((l) => l.type === 'income')} />
              <BudgetSection
                type="expense"
                lines={plan.lines.filter((l) => l.type === 'expense')}
              />
            </div>
            {plan.benefitAccounts?.length ? (
              <details className="planning-preferences planning-benefit-settings">
                <summary>Regra de créditos VA/VR</summary>
                <BenefitPlanningNotice plan={plan} scope="all" />
              </details>
            ) : null}
            <div className="planning-category-management">
              <Link to="/categories">
                Gerenciar categorias <ArrowRight size={14} />
              </Link>
            </div>
            <Modal
              open={dialog === 'edit'}
              onOpenChange={(open) => !open && setDialog(null)}
              title="Preparar planejamento"
              description="Defina os valores previstos para o mês selecionado."
            >
              {dialog === 'edit' && <PlanForm plan={plan} onSave={save} onSaved={saved} />}
            </Modal>
            <Modal
              open={dialog === 'copy'}
              onOpenChange={(open) => !open && setDialog(null)}
              title="Revisar cópia do mês anterior"
              description="Confira o que será substituído antes de confirmar."
            >
              {dialog === 'copy' && <CopyPlanDialog plan={plan} onCopy={copy} onCopied={saved} />}
            </Modal>
          </>
        )
      )}
    </div>
  );
}
