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
  const account = accounts.find((item) => item.id === (accountId || accounts[0]?.id));
  const key = category.type === 'income' ? 'defaultIncomeCategoryId' : 'defaultExpenseCategoryId';
  const current = account?.[key] ?? null;
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
      title={replacing ? 'Trocar categoria padrão?' : 'Categoria padrão'}
      description={
        replacing ? `Trocar ${currentName} por ${category.name} em ${account?.name}?` : undefined
      }
    >
      <FinanceChoices accounts={choices.accounts} categories={choices.categories}>
        <FinanceForm
          label={replacing ? 'Confirmar troca' : 'Salvar padrão'}
          disabled={!account || next === current}
          onSubmit={async () => {
            if (!account || next === current) return;
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
          {accounts.length ? (
            <>
              <label>
                Conta
                <Select
                  value={account?.id ?? ''}
                  onChange={(event) => {
                    setAccountId(event.target.value);
                    setEnabled(undefined);
                  }}
                >
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
                Ao importar um extrato desta conta, o padrão preenche{' '}
                {category.type === 'income' ? 'receitas' : 'despesas'} que ficarem sem categoria.
                Suas escolhas e regras têm prioridade.
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
