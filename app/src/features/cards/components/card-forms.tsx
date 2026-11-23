import { Minus, Plus } from 'lucide-react';
import { IconAction } from '../../../shared/ui/icon-action';
import { HelpTip } from '../../../shared/ui/tooltip';
import { MoneyField } from '../../../shared/ui/controls/money-field';
import { Button } from '../../../shared/ui/primitives';
import { Select } from '../../../shared/ui/controls/select';
import {
  artworkIssuerLogos,
  cardArtwork,
  cardArtworkIssuer,
  cardArtworksForIssuer,
  invoiceIssuers,
  issuerLogos,
  type CardIssuer,
  suggestCardArtwork,
  type CardArtworkId,
} from '../art/catalog';
import { MonthPicker } from '../../../shared/ui/controls/month-picker';
import { DatePicker } from '../../../shared/ui/controls/date-picker';
import { useState } from 'react';
import type { CreditCard, CardPurchase } from '../../../shared/api/resources';
import {
  FinanceForm,
  FinanceChoices,
  moneyInput,
  useFinanceChoices,
} from '../../../shared/ui/finance-forms';
import { CategorySelect } from '../../../shared/ui/category-select';
import { dateToday, parseMoney } from '../../../shared/formatting/money';
import type { useFinanceWrite } from '../../../shared/api/use-finance-write';
type Writer = ReturnType<typeof useFinanceWrite>;
export function CardForm({
  card,
  write,
  onSaved,
  onDelete,
}: {
  card?: CreditCard;
  write: Writer;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const choices = useFinanceChoices();
  const [manualArtwork, setArtwork] = useState<CardArtworkId | '' | undefined>(
    card?.artwork ?? undefined,
  );
  const [name, setName] = useState(card?.name ?? '');
  const [manualIssuer, setManualIssuer] = useState<CardIssuer | '' | undefined>();
  const issuer = manualIssuer ?? cardArtworkIssuer(manualArtwork ?? suggestCardArtwork(name)) ?? '';
  const artwork = issuer ? (manualArtwork ?? suggestCardArtwork(name, issuer)) : '';
  const [closing, setClosing] = useState(String(card?.closingDay ?? 10));
  const [due, setDue] = useState(String(card?.dueDay ?? 20));
  const [limit, setLimit] = useState(card ? moneyInput(card.limit) : '');
  const [archived, setArchived] = useState(card?.archived ?? false);
  return (
    <FinanceChoices accounts={choices.accounts}>
      <FinanceForm
        label={card ? 'Salvar cartão' : 'Adicionar cartão'}
        onSubmit={async () => {
          await write(
            card ? `/cards/${card.id}` : '/cards',
            {
              name,
              artwork: artwork || null,
              paymentAccountId: null,
              closingDay: Number(closing),
              dueDay: Number(due),
              limit: limit.trim() ? parseMoney(limit) : 0,
              ...(card ? { archived } : {}),
            },
            card?.version,
            card ? 'PATCH' : 'POST',
          );
          onSaved();
        }}
      >
        <div className="proportional-fields value-date-fields">
          <label>
            Nome do cartão
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Meu cartão"
            />
          </label>
          <label>
            Banco
            <Select
              value={issuer}
              optionIcons={issuerLogos}
              onChange={(event) => {
                setManualIssuer(event.target.value as CardIssuer | '');
                setArtwork(undefined);
              }}
            >
              <option value="">Outro ou não identificado</option>
              {Object.entries(invoiceIssuers).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {issuer && (
          <label>
            Modelo do cartão
            <Select
              value={artwork}
              optionIcons={artworkIssuerLogos}
              onChange={(event) => setArtwork(event.target.value as CardArtworkId)}
            >
              {cardArtworksForIssuer(issuer).map((id) => (
                <option key={id} value={id}>
                  {cardArtwork[id].label}
                </option>
              ))}
            </Select>
          </label>
        )}
        <div className="proportional-fields three-fields">
          <label>
            Fechamento
            <input
              required
              type="number"
              min={1}
              max={31}
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
            />
          </label>
          <label>
            Vencimento
            <input
              required
              type="number"
              min={1}
              max={31}
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <label>
            Limite (R$)
            <MoneyField
              aria-label="Limite informado (R$)"
              maxLength={20}
              value={limit}
              onValueChange={setLimit}
            />
          </label>
        </div>
        {card && (
          <label className="finance-checkbox">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            Arquivar cartão quitado
          </label>
        )}
        <div className="field-assistance">
          <HelpTip
            label="Regras da fatura"
            text="Compras no fechamento entram na próxima fatura. Em meses curtos, usamos o último dia. Faturas registradas mantêm as datas. O limite é informativo e a conta é escolhida no pagamento."
          />
        </div>
        {onDelete && (
          <Button type="button" className="destructive" onClick={onDelete}>
            Excluir cartão
          </Button>
        )}
      </FinanceForm>
    </FinanceChoices>
  );
}
export function CardPurchaseForm({
  card,
  write,
  onSaved,
}: {
  card: CreditCard;
  write: Writer;
  onSaved: (month?: string) => void;
}) {
  const choices = useFinanceChoices();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(dateToday());
  const [installments, setInstallments] = useState('1');
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('');
  return (
    <FinanceChoices accounts={choices.accounts} categories={choices.categories}>
      <FinanceForm
        label="Registrar compra"
        onSubmit={async () => {
          const result = await write<CardPurchase>(
            `/cards/${card.id}/purchases`,
            {
              description,
              amount: parseMoney(amount),
              purchaseDate: date,
              installments: Number(installments),
              categoryId: category || null,
              ...(month ? { firstBillMonth: month } : {}),
            },
            card.version,
          );
          onSaved(result.firstBillMonth);
        }}
      >
        <label>
          Descrição da compra
          <input
            required
            maxLength={120}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Estabelecimento ou compra"
          />
        </label>
        <div className="proportional-fields value-date-fields">
          <label>
            Valor total da compra (R$)
            <MoneyField
              aria-label="Valor total da compra (R$)"
              required
              maxLength={20}
              value={amount}
              onValueChange={setAmount}
            />
          </label>
          <div className="installment-field">
            <label htmlFor="purchase-installments">Parcelas</label>
            <div className="installment-stepper">
              <IconAction
                label="Diminuir parcelas"
                icon={<Minus size={14} />}
                disabled={Number(installments) <= 1}
                onClick={() => setInstallments(String(Math.max(1, Number(installments) - 1)))}
              />
              <input
                id="purchase-installments"
                aria-label="Quantidade de parcelas"
                required
                type="number"
                min={1}
                max={120}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
              <IconAction
                label="Aumentar parcelas"
                icon={<Plus size={14} />}
                disabled={Number(installments) >= 120}
                onClick={() => setInstallments(String(Math.min(120, Number(installments) + 1)))}
              />
            </div>
          </div>
        </div>
        <div className="proportional-fields two-fields">
          <label>
            Data da compra
            <DatePicker
              required
              min="1900-01-01"
              max={dateToday()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Categoria
            <CategorySelect
              categories={choices.categories.data ?? []}
              type="expense"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
        </div>
        <label>
          Primeira fatura (opcional)
          <MonthPicker
            min={date.slice(0, 7)}
            max="9998-12"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <HelpTip
          label="Como funciona a primeira fatura"
          text="Deixe em branco para calcular pelo fechamento ou informe o mês atribuído pelo emissor. Cada parcela entra no mês da própria fatura, sem retirar dinheiro da conta agora."
        />
      </FinanceForm>
    </FinanceChoices>
  );
}
export function CardOpeningForm({
  card,
  month,
  write,
  onSaved,
}: {
  card: CreditCard;
  month: string;
  write: Writer;
  onSaved: (month?: string) => void;
}) {
  const [value, setValue] = useState('');
  const [billMonth, setMonth] = useState(month);
  return (
    <FinanceForm
      label="Registrar dívida anterior"
      onSubmit={async () => {
        await write(
          `/cards/${card.id}/opening`,
          { billMonth, amount: parseMoney(value) },
          card.version,
        );
        onSaved(billMonth);
      }}
    >
      <div className="proportional-fields two-fields">
        <label>
          Valor anterior a pagar (R$)
          <MoneyField
            aria-label="Valor anterior a pagar (R$)"
            required
            maxLength={20}
            value={value}
            onValueChange={setValue}
          />
        </label>
        <label>
          Fatura de vencimento
          <MonthPicker
            required
            min="1900-02"
            max="9998-12"
            value={billMonth}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
      </div>
      <HelpTip
        label="Como registrar dívida anterior"
        text="Informe apenas o saldo ainda não registrado. Cada inclusão soma à fatura escolhida sem criar uma despesa nova."
      />
    </FinanceForm>
  );
}
