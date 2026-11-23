import { HelpTip } from '../../../shared/ui/tooltip';
import { DatePicker } from '../../../shared/ui/controls/date-picker';
import { Select } from '../../../shared/ui/controls/select';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { request } from '../../../shared/api/client';
import type { CreditCard, CardBill, ManagedEntry } from '../../../shared/api/resources';
import {
  FinanceForm,
  FinanceChoices,
  moneyInput,
  useFinanceChoices,
} from '../../../shared/ui/finance-forms';
import { ViewSwitcher } from '../../../shared/ui/view-switcher';
import { ErrorState, Loading } from '../../../shared/ui/primitives';
import { dateToday, money, parseMoney, shortDate } from '../../../shared/formatting/money';
import type { useFinanceWrite } from '../../../shared/api/use-finance-write';
export function CardPaymentForm({
  card,
  bill,
  write,
  onSaved,
}: {
  card: CreditCard;
  bill: CardBill;
  write: ReturnType<typeof useFinanceWrite>;
  onSaved: () => void;
}) {
  const choices = useFinanceChoices();
  const [mode, setMode] = useState('link');
  const [account, setAccount] = useState(card.paymentAccountId ?? '');
  const [amount, setAmount] = useState(moneyInput(bill.remaining));
  const [date, setDate] = useState(dateToday());
  const [transaction, setTransaction] = useState('');
  const shift = (n: number) =>
    new Date(new Date(`${bill.dueDate}T12:00:00Z`).getTime() + n * 86400000)
      .toISOString()
      .slice(0, 10);
  const [from, setFrom] = useState(
    [
      shift(-30),
      new Date(new Date().getTime() - 30 * 86400000).toISOString().slice(0, 10),
    ].sort()[0],
  );
  const [to, setTo] = useState(
    bill.dueDate > dateToday() ? dateToday() : shift(15) > dateToday() ? dateToday() : shift(15),
  );
  const availableAccounts =
    choices.accounts.data?.filter(
      (a) =>
        !a.archived &&
        !['benefit_food', 'benefit_meal', 'credit_card', 'investment'].includes(a.type),
    ) ?? [];
  const validAccount = availableAccounts.some((a) => a.id === account);
  const candidates = useQuery({
    queryKey: ['card-candidates', card.id, account, from, to],
    queryFn: () =>
      request<ManagedEntry[]>(
        `/cards/${card.id}/candidates?${new URLSearchParams({ accountId: account, from, to })}`,
      ),
    enabled: mode === 'link' && validAccount && !!from && !!to && from <= to,
  });
  const selected = candidates.data?.find((t) => t.id === transaction);
  return (
    <FinanceChoices accounts={choices.accounts}>
      <FinanceForm
        label={mode === 'link' ? 'Vincular pagamento' : 'Registrar pagamento'}
        disabled={
          !validAccount ||
          (mode === 'link' && (!selected || Math.abs(selected.amount) > bill.remaining))
        }
        onSubmit={async () => {
          const value = mode === 'link' ? Math.abs(selected!.amount) : parseMoney(amount);
          if (value > bill.remaining || value <= 0)
            throw new Error('O valor deve ser positivo e não superar o pendente da fatura.');
          await write(
            `/cards/${card.id}/bills/${bill.month}/payments`,
            {
              mode,
              accountId: account,
              date: mode === 'link' ? selected!.transactionDate : date,
              amount: value,
              ...(mode === 'link'
                ? { transactionId: selected!.id, transactionVersion: selected!.version }
                : {}),
            },
            card.version,
          );
          onSaved();
        }}
      >
        <p>
          <strong>{card.name}</strong> · pendente {money(bill.remaining)}
        </p>
        <ViewSwitcher
          label="Modo de pagamento da fatura"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'link', label: 'Já está no extrato' },
            { value: 'create', label: 'Registrar agora' },
          ]}
        />
        <label>
          Conta do pagamento
          <Select
            required
            aria-label="Conta do pagamento"
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setTransaction('');
            }}
          >
            <option value="">Selecione a conta</option>
            {availableAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </label>
        {mode === 'link' ? (
          <>
            <HelpTip
              label="Como funciona o vínculo"
              text="A saída vira uma transferência para o cartão. Seu valor é preservado e a despesa não é duplicada."
            />
            <details className="finance-period">
              <summary>Período da busca</summary>
              <div className="form-grid">
                <label>
                  De
                  <DatePicker
                    required
                    value={from}
                    max={to}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setTransaction('');
                    }}
                  />
                </label>
                <label>
                  Até
                  <DatePicker
                    required
                    value={to}
                    min={from}
                    max={dateToday()}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setTransaction('');
                    }}
                  />
                </label>
              </div>
              <p className="field-help">Até 366 dias e 100 resultados por busca.</p>
            </details>
            {!validAccount ? (
              <p>Escolha uma conta de dinheiro ou reserva disponível para buscar o pagamento.</p>
            ) : from > to ? (
              <p role="alert">A data inicial deve vir antes da final.</p>
            ) : candidates.isPending ? (
              <Loading />
            ) : candidates.isError ? (
              <ErrorState error={candidates.error} retry={() => void candidates.refetch()} />
            ) : candidates.data?.length ? (
              <label>
                Saída do extrato
                <Select
                  required
                  aria-label="Saída do extrato"
                  value={transaction}
                  onChange={(e) => setTransaction(e.target.value)}
                >
                  <option value="">Escolha o pagamento</option>
                  {candidates.data.map((t) => (
                    <option key={t.id} value={t.id} disabled={Math.abs(t.amount) > bill.remaining}>
                      {shortDate(t.transactionDate)} · {t.description} · {money(Math.abs(t.amount))}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <p>
                Nenhuma saída livre neste período. Amplie a busca ou registre somente se o movimento
                ainda não estiver na conta.
              </p>
            )}
            <HelpTip
              label="Quais pagamentos aparecem"
              text="A lista inclui saídas disponíveis da conta. Pagamentos vinculados ficam na fatura. O valor vinculado não pode superar o saldo pendente."
            />
            {selected && (
              <p className="finance-review">
                Será vinculado {money(Math.abs(selected.amount))}, em{' '}
                {shortDate(selected.transactionDate)}.
              </p>
            )}
          </>
        ) : (
          <>
            <label>
              Valor pago (R$)
              <input
                required
                inputMode="decimal"
                maxLength={20}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Data do pagamento
              <DatePicker
                required
                min="1900-01-01"
                max={dateToday()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <HelpTip
              label="Como registrar um pagamento"
              text="O registro é uma transferência, inclusive para pagamento parcial. O pagamento no banco é feito separadamente."
            />
          </>
        )}
      </FinanceForm>
    </FinanceChoices>
  );
}
