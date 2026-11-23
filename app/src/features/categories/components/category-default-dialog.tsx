import { useState } from 'react';
import type { Category } from '../../../shared/api/resources';
import { useFinanceWrite } from '../../../shared/api/use-finance-write';
import { Select } from '../../../shared/ui/controls/select';
import { ToggleField } from '../../../shared/ui/controls/toggle-field';
import { FinanceChoices, FinanceForm, useFinanceChoices } from '../../../shared/ui/finance-forms';
import { Modal } from '../../../shared/ui/primitives';

export function CategoryDefaultDialog({
  category,
  onClose,
}: {
  category: Category;
  onClose: () => void;
}) {
  const choices = useFinanceChoices();
  const write = useFinanceWrite();
  const [accountId, setAccountId] = useState('');
  const [enabled, setEnabled] = useState<boolean>();
  const accounts = (choices.accounts.data ?? []).filter(
    (account) => !account.archived && !['credit_card', 'investment'].includes(account.type),
  );
  const scope = accountId || (category.type === 'expense' ? 'workspace' : accounts[0]?.id || '');
  const workspace = scope === 'workspace';
  const account = accounts.find((item) => item.id === scope);
  const key = category.type === 'income' ? 'defaultIncomeCategoryId' : 'defaultExpenseCategoryId';
  const workspaceCategory = choices.categories.data?.find((item) => item.workspaceImportDefault);
  const current = (workspace ? workspaceCategory?.id : account?.[key]) ?? null;
  const scopeLabel = workspace ? 'no espaço' : `na conta ${account?.name}`;
  const checked = enabled ?? current === category.id;
  const next = checked ? category.id : current === category.id ? null : current;
  const replacing = !!current && !!next && current !== next;
  const currentName =
    choices.categories?.data?.find((item) => item.id === current)?.name ??
    'a categoria padrão atual';

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        replacing
          ? 'Trocar categoria padrão?'
          : workspace
            ? 'Categoria padrão de gastos'
            : 'Categoria padrão'
      }
      description={
        replacing ? `Trocar ${currentName} por ${category.name} ${scopeLabel}?` : undefined
      }
    >
      <FinanceChoices accounts={choices.accounts} categories={choices.categories}>
        <FinanceForm
          label={replacing ? 'Confirmar troca' : 'Salvar padrão'}
          disabled={(!workspace && !account) || next === current}
          onSubmit={async () => {
            if (next === current) return;
            if (workspace) {
              await write(
                '/categories/workspace-import-default',
                {
                  categoryId: next,
                  expectedCategoryId: current,
                },
                undefined,
                'PATCH',
              );
            } else if (account)
              await write(
                `/accounts/${account.id}`,
                {
                  name: account.name,
                  institution: account.institution,
                  type: account.type,
                  [key]: next,
                },
                account.version,
                'PATCH',
              );
            onClose();
          }}
        >
          {workspace || accounts.length ? (
            <>
              <label>
                Aplicar a
                <Select
                  value={scope}
                  onChange={(event) => {
                    setAccountId(event.target.value);
                    setEnabled(undefined);
                  }}
                >
                  {category.type === 'expense' && <option value="workspace">Espaço inteiro</option>}
                  {accounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </label>
              <ToggleField checked={checked} onChange={setEnabled}>
                Usar {category.name} como padrão de{' '}
                {category.type === 'income' ? 'receita' : 'despesa'}
              </ToggleField>
              <p className="field-help">
                {workspace
                  ? 'Preenche as novas despesas na revisão do extrato. Você pode trocar a categoria de qualquer item.'
                  : 'Usada ao importar nesta conta quando não houver escolha manual ou regra reconhecida.'}
              </p>
            </>
          ) : (
            <p>Adicione uma conta para definir a categoria padrão.</p>
          )}
        </FinanceForm>
      </FinanceChoices>
    </Modal>
  );
}
