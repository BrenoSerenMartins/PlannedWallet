import { PageHeader } from '../../shared/ui/page-header';
import { PlanningCardBills } from './components/planning-card-bills';
import { ActionMenu } from '../../shared/ui/action-menu';
import type { ReactNode } from 'react';
import { useNotifications } from '../../shared/feedback/notification-provider';
import { BenefitPlanningNotice } from './components/benefit-planning-notice';
import { CommitmentsPage } from './commitments-page';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { validMonth } from '../../shared/formatting/month';
import { Copy, Pencil, ArrowRight } from 'lucide-react';
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
      <PageHeader route title="Planejamento mensal" />
      {query.isPending ? (
        <Loading layout="planning" />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        plan && (
          <>
            <PlanningSummary
              plan={plan}
              month={month}
              onMonthChange={(value) => {
                setMonth(value);
                setMessage('');
              }}
              navigation={navigation}
              onEditPlan={() => setDialog('edit')}
              commitments={<PlanningCardBills plan={plan} />}
              periodActions={
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
              }
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
            >
              {dialog === 'edit' && <PlanForm plan={plan} onSave={save} onSaved={saved} />}
            </Modal>
            <Modal
              open={dialog === 'copy'}
              onOpenChange={(open) => !open && setDialog(null)}
              title="Revisar cópia do mês anterior"
            >
              {dialog === 'copy' && <CopyPlanDialog plan={plan} onCopy={copy} onCopied={saved} />}
            </Modal>
          </>
        )
      )}
    </div>
  );
}
