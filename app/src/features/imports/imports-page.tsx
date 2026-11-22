import { AutomaticImportBatch } from './components/automatic-import-batch';
import { useAutomaticImportBatch } from './hooks/use-automatic-import-batch';
import '../../shared/ui/card-invoice-preview.css';
import { FileText as EmptyStateIcon } from 'lucide-react';
import { Select } from '../../shared/ui/controls/select';
import { MonthPicker } from '../../shared/ui/controls/month-picker';
import { PageHeader } from '../../shared/ui/page-header';
import { CheckCircle2 } from 'lucide-react';
import { ImportReview } from './components/import-review';
import { useRef, useState } from 'react';
import { useStatementUploads } from './hooks/use-statement-uploads';
import { UploadResults } from './components/upload-results';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ChevronRight, FileText, Upload } from 'lucide-react';
import { useAuth } from '../auth/auth-provider';
import { jsonBody, request } from '../../shared/api/client';
import type { Account, CardsSummary, ImportBatch } from '../../shared/api/resources';
import { Button, EmptyState, ErrorState, Loading } from '../../shared/ui/primitives';
import { money } from '../../shared/formatting/money';
const invoiceIssuers = {
  mercado_pago: 'Mercado Pago',
  inter: 'Inter',
  itau: 'Itaú',
  c6: 'C6 Bank',
};
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00`),
  );
export function ImportsPage() {
  const { importId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const automaticSelection = useRef(false);
  const batchPassword = useRef('');
  const automaticBatch = useAutomaticImportBatch(() => {
    void client.invalidateQueries();
  });
  const [pdfPassword, setPdfPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detected, setDetected] = useState<
    | {
        kind: 'account_statement';
        institution: 'mercado_pago' | 'alelo' | 'banco_do_brasil';
        reportType: string;
        itemCount: number;
        sourceFormat: string;
      }
    | {
        kind: 'card_invoice';
        institution: keyof typeof invoiceIssuers | null;
        summaryOnly: boolean;
        reportType: 'card_invoice';
        itemCount: number;
        sourceFormat: string;
        billMonth: string;
      }
    | null
  >(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [destination, setDestination] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState('');
  const [saving, setSaving] = useState(false);
  const [billMonth, setBillMonth] = useState(new Date().toISOString().slice(0, 7));
  const [newCardName, setNewCardName] = useState('Meu cartão');
  const [closingDay, setClosingDay] = useState('10');
  const [dueDay, setDueDay] = useState('20');
  const [cardPreview, setCardPreview] = useState<{
    replacesInvoiceId?: string | null;
    id: string;
    cardId: string;
    status: string;
    version: number;
    billMonth: string;
    parsed: {
      total: number;
      dueDate?: string;
      summaryOnly?: boolean;
      balanceBreakdown?: { purchases: number; previousBalance: number; paymentsAndCredits: number };
      lines: Array<{
        date: string;
        description: string;
        amount: number;
        installmentNumber: number | null;
        installmentCount: number | null;
      }>;
      warnings: string[];
    };
    reconciliation: Array<{ confidence: string; purchaseId: string | null }>;
  } | null>(null);
  const [view, setView] = useState('upload');
  const uploads = useStatementUploads((rows) => {
    void client.invalidateQueries({ queryKey: [session?.user.id, 'imports'] });
    if (rows.length === 1 && rows[0].result) navigate('/imports/' + rows[0].result.id);
  });
  const busy = uploads.busy || saving || automaticBatch.busy;
  const accounts = useQuery({
    queryKey: [session?.user.id, 'accounts'],
    queryFn: () => request<Account[]>('/accounts'),
  });
  const cards = useQuery({
    queryKey: [session?.user.id, 'cards', billMonth],
    queryFn: () => request<CardsSummary>(`/cards?month=${billMonth}`),
  });
  const history = useQuery({
    queryKey: [session?.user.id, 'imports'],
    queryFn: () =>
      request<{ id: string; fileName: string; status: string; createdAt: string }[]>('/imports'),
  });
  const batch = useQuery({
    queryKey: [session?.user.id, 'import', importId],
    queryFn: () => request<ImportBatch>(`/imports/${importId}`),
    enabled: !!importId,
  });
  const chooseStatement = async (file: File) => {
    setSelectedFile(file);
    setCardPreview(null);
    setReplaceConfirmed(false);
    setDetected(null);
    setDetectError('');
    setDetecting(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('billMonth', billMonth);
      if (pdfPassword) form.set('password', pdfPassword);
      const result = await request<Exclude<NonNullable<typeof detected>, null>>('/imports/detect', {
        method: 'POST',
        body: form,
      });
      setDetected(result);
      setBillMonth(result.kind === 'card_invoice' ? result.billMonth : billMonth);
      if (result.kind === 'account_statement') {
        const compatible = (accounts.data ?? []).filter(
          (item) =>
            item.institution === result.institution &&
            (result.institution !== 'alelo' || item.type === 'benefit_food'),
        );
        setDestination(compatible[0]?.id ?? '__new__');
        setNewAccountName(
          result.institution === 'alelo'
            ? 'Alelo Alimentação'
            : result.institution === 'banco_do_brasil'
              ? 'Banco do Brasil'
              : 'Mercado Pago',
        );
      } else {
        setDestination('__new__');
        setNewCardName(result.institution ? invoiceIssuers[result.institution] : 'Meu cartão');
      }
    } catch (cause) {
      setDetectError(
        cause instanceof Error ? cause.message : 'Não foi possível identificar o extrato.',
      );
    } finally {
      setDetecting(false);
    }
  };
  const continueStatement = async () => {
    if (!selectedFile || !detected || busy) return;
    setSaving(true);
    setDetectError('');
    try {
      if (detected.kind === 'card_invoice') {
        let cardId = destination;
        if (destination === '__new__') {
          const created = await request<{ id: string }>('/cards', {
            method: 'POST',
            headers: { 'Idempotency-Key': crypto.randomUUID() },
            body: jsonBody({
              name: newCardName.trim(),
              paymentAccountId: null,
              closingDay: Number(closingDay),
              dueDay: Number(dueDay),
              limit: 0,
            }),
          });
          cardId = created.id;
          setDestination(cardId);
          await client.invalidateQueries({ queryKey: [session?.user.id, 'cards'] });
        }
        const form = new FormData();
        form.set('billMonth', billMonth);
        if (pdfPassword) form.set('password', pdfPassword);
        form.set('file', selectedFile);
        if (pdfPassword) form.set('password', pdfPassword);
        setCardPreview(
          await request<NonNullable<typeof cardPreview>>(`/cards/${cardId}/invoices/import`, {
            method: 'POST',
            body: form,
          }),
        );
        setPdfPassword('');
      } else {
        let accountId = destination;
        if (destination === '__new__') {
          const created = await request<Account>('/accounts', {
            method: 'POST',
            body: jsonBody({
              name: newAccountName.trim(),
              institution: detected.institution,
              type: detected.institution === 'alelo' ? 'benefit_food' : 'checking',
              ...(detected.institution === 'alelo' ? { benefitCreditMonth: 'received' } : {}),
            }),
          });
          accountId = created.id;
          setDestination(accountId);
          await client.invalidateQueries({ queryKey: [session?.user.id, 'accounts'] });
        }
        await uploads.upload([selectedFile], accountId);
      }
    } catch (cause) {
      setDetectError(cause instanceof Error ? cause.message : 'Não foi possível preparar a conta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-enter imports-page">
      <PageHeader
        title={importId ? 'Revise seu extrato' : 'Importar extrato'}
        description={
          importId
            ? (batch.data?.fileName ?? 'Confira os movimentos antes de concluir.')
            : undefined
        }
      >
        {importId && (
          <Link className="button secondary" to="/imports">
            <ArrowLeft size={16} />
            Importações
          </Link>
        )}
      </PageHeader>
      <ol className="import-stepper" aria-label="Etapas da importação">
        {['Enviar arquivo', 'Revisar movimentos', 'Concluir'].map((label, index) => {
          const current = !importId
            ? 0
            : ['confirmed', 'history'].includes(batch.data?.status ?? '')
              ? 2
              : 1;
          return (
            <li
              key={label}
              aria-current={index === current ? 'step' : undefined}
              data-complete={index < current}
            >
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              {label}
            </li>
          );
        })}
      </ol>
      {importId ? (
        batch.isPending ? (
          <Loading />
        ) : batch.isError && !batch.data ? (
          <ErrorState error={batch.error} retry={() => void batch.refetch()} />
        ) : (
          <>
            {batch.isError && (
              <div className="review-banner" role="status">
                <p>
                  Não foi possível atualizar o relatório. Os últimos dados carregados continuam
                  visíveis.
                </p>
                <Button className="secondary" onClick={() => void batch.refetch()}>
                  Atualizar relatório
                </Button>
              </div>
            )}
            <ImportReview
              key={batch.data!.id}
              batch={batch.data!}
              refresh={() => client.invalidateQueries()}
            />
          </>
        )
      ) : (
        <>
          <label className="workspace-section-select">
            <span className="sr-only">Seções de importação</span>
            <Select
              aria-label="Seções de importação"
              value={view}
              onChange={(event) => setView(event.target.value)}
            >
              <option value="upload">Enviar arquivos</option>
              <option value="history">Histórico</option>
            </Select>
          </label>
          <div hidden={view !== 'upload'} className="view-content">
            <AutomaticImportBatch
              batch={automaticBatch}
              onSelect={(password) => {
                automaticSelection.current = true;
                batchPassword.current = password;
                input.current?.click();
              }}
              onReview={(file) => {
                void chooseStatement(file);
              }}
            />
            <div className="import-grid">
              <section className="panel upload-panel">
                <span className="file-icon">
                  <FileText size={28} />
                </span>
                <h2>Selecione seus extratos</h2>
                <p>
                  Mercado Pago: extratos PDF, CSV e XLSX. Banco do Brasil: extrato CSV. Alelo
                  Alimentação: PDF com texto, com revisão da cobertura e dos movimentos.
                </p>
                {accounts.isPending ? (
                  <Loading />
                ) : accounts.isError ? (
                  <ErrorState error={accounts.error} />
                ) : (
                  <>
                    <label>
                      Senha do PDF (se houver)
                      <input
                        type="password"
                        autoComplete="off"
                        maxLength={128}
                        value={pdfPassword}
                        disabled={busy || detecting}
                        onChange={(event) => setPdfPassword(event.target.value)}
                      />
                    </label>
                    <input
                      ref={(element) => {
                        input.current = element;
                        if (element)
                          element.oncancel = () => {
                            automaticSelection.current = false;
                            batchPassword.current = '';
                          };
                      }}
                      type="file"
                      multiple
                      disabled={busy || detecting}
                      accept="application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,.csv,.xlsx"
                      hidden
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = '';
                        if (!files.length) return;
                        if (automaticSelection.current || files.length > 1) {
                          const password = batchPassword.current || pdfPassword;
                          automaticSelection.current = false;
                          batchPassword.current = '';
                          void automaticBatch.analyze(files, password);
                        } else void chooseStatement(files[0]);
                      }}
                    />
                    {cardPreview ? (
                      <section aria-label="Prévia da fatura importada">
                        <p role="status">
                          <strong>Fatura lida para {monthLabel(cardPreview.billMonth)}</strong>
                        </p>
                        <p>
                          {cardPreview.parsed.lines.length} compras · Total da fatura{' '}
                          <strong className="tabular-nums">
                            {money(cardPreview.parsed.total)}
                          </strong>
                        </p>
                        <p className="field-help">
                          {cardPreview.status === 'confirmed'
                            ? 'Fatura confirmada.'
                            : 'Confira os lançamentos antes de aplicar a fatura ao cartão.'}
                        </p>
                        {cardPreview.parsed.dueDate && (
                          <p>
                            Vence em {cardPreview.parsed.dueDate.split('-').reverse().join('/')}
                          </p>
                        )}
                        {!cardPreview.parsed.summaryOnly &&
                          cardPreview.parsed.lines.reduce((sum, line) => sum + line.amount, 0) !==
                            cardPreview.parsed.total && (
                            <p className="field-help">
                              Compras:{' '}
                              {money(
                                cardPreview.parsed.lines.reduce(
                                  (sum, line) => sum + line.amount,
                                  0,
                                ),
                              )}
                              {cardPreview.parsed.balanceBreakdown && (
                                <>
                                  {' '}
                                  · Saldo anterior:{' '}
                                  {money(cardPreview.parsed.balanceBreakdown.previousBalance)} ·
                                  Pagamentos e créditos: −
                                  {money(cardPreview.parsed.balanceBreakdown.paymentsAndCredits)}
                                </>
                              )}
                            </p>
                          )}
                        {cardPreview.parsed.warnings.map((warning) => (
                          <p className="field-help" key={warning}>
                            {warning}
                          </p>
                        ))}
                        {cardPreview.replacesInvoiceId && cardPreview.status === 'review' && (
                          <label>
                            <input
                              type="checkbox"
                              checked={replaceConfirmed}
                              onChange={(event) => setReplaceConfirmed(event.target.checked)}
                            />
                            Substituir a importação já confirmada neste mês, preservando o histórico
                            anterior.
                          </label>
                        )}
                        <ul className="card-invoice-import-preview">
                          {cardPreview.parsed.lines.map((line, index) => (
                            <li key={`${line.date}-${index}`}>
                              <span>
                                {line.description}
                                <small>
                                  {line.date}
                                  {line.installmentNumber
                                    ? ` · ${line.installmentNumber}/${line.installmentCount}`
                                    : ''}
                                </small>
                              </span>
                              <strong className="tabular-nums">{money(line.amount)}</strong>
                              <small>
                                {cardPreview.reconciliation[index]?.confidence === 'exact'
                                  ? 'Encontrado'
                                  : cardPreview.reconciliation[index]?.confidence === 'ambiguous'
                                    ? 'Revisar'
                                    : 'Novo'}
                              </small>
                            </li>
                          ))}
                        </ul>
                        {detectError && (
                          <p className="form-error" role="alert">
                            {detectError}
                          </p>
                        )}
                        {(cardPreview.status === 'review' || cardPreview.status === 'confirmed') &&
                          !cardPreview.parsed.summaryOnly &&
                          (cardPreview.parsed.lines.reduce((sum, line) => sum + line.amount, 0) ===
                            cardPreview.parsed.total ||
                            !!cardPreview.parsed.balanceBreakdown) && (
                            <Button
                              disabled={
                                busy || (!!cardPreview.replacesInvoiceId && !replaceConfirmed)
                              }
                              onClick={async () => {
                                setSaving(true);
                                setDetectError('');
                                try {
                                  setCardPreview(
                                    await request<NonNullable<typeof cardPreview>>(
                                      `/cards/invoices/${cardPreview.id}/confirm`,
                                      {
                                        method: 'POST',
                                        headers: {
                                          'If-Match': String(cardPreview.version),
                                          ...(cardPreview.replacesInvoiceId && replaceConfirmed
                                            ? {
                                                'X-Replaces-Invoice': cardPreview.replacesInvoiceId,
                                              }
                                            : {}),
                                        },
                                      },
                                    ),
                                  );
                                  await client.invalidateQueries();
                                } catch (cause) {
                                  setDetectError(
                                    cause instanceof Error
                                      ? cause.message
                                      : 'Não foi possível confirmar a fatura.',
                                  );
                                } finally {
                                  setSaving(false);
                                }
                              }}
                            >
                              {busy
                                ? 'Confirmando…'
                                : cardPreview.status === 'confirmed'
                                  ? 'Reconciliar saldo'
                                  : 'Confirmar e substituir compras do ciclo'}
                            </Button>
                          )}
                        <Link
                          className="button"
                          to={`/cards?card=${cardPreview.cardId}&month=${cardPreview.billMonth}`}
                        >
                          Abrir cartão <ArrowRight size={16} />
                        </Link>
                        <Button
                          className="secondary compact"
                          onClick={() => {
                            setCardPreview(null);
                            setReplaceConfirmed(false);
                            setSelectedFile(null);
                            setDetected(null);
                          }}
                        >
                          Importar outro arquivo
                        </Button>
                      </section>
                    ) : !selectedFile ? (
                      <Button
                        disabled={busy || detecting || !navigator.onLine}
                        onClick={() => input.current?.click()}
                      >
                        <Upload size={18} /> Selecionar fatura ou extrato
                      </Button>
                    ) : detecting ? (
                      <Loading />
                    ) : detected ? (
                      <>
                        <p role="status" className="field-help">
                          {detected.kind === 'card_invoice'
                            ? `Fatura de cartão${detected.institution ? ' ' + invoiceIssuers[detected.institution] : ''} · ${detected.summaryOnly ? 'Resumo identificado' : detected.itemCount + ' compras reconhecidas'}`
                            : `${detected.institution === 'alelo' ? 'Alelo Alimentação' : detected.institution === 'banco_do_brasil' ? 'Banco do Brasil' : 'Mercado Pago'} · ${detected.itemCount} movimentos identificados`}
                        </p>
                        {detected.kind === 'card_invoice' ? (
                          <>
                            <label>
                              Mês da fatura
                              <MonthPicker
                                required
                                value={billMonth}
                                onChange={(e) => setBillMonth(e.target.value)}
                              />
                            </label>
                            <label>
                              Cartão de destino
                              <Select
                                value={destination}
                                disabled={busy || cards.isPending}
                                onChange={(e) => setDestination(e.target.value)}
                              >
                                <option value="__new__">Criar cartão com esta fatura</option>
                                {cards.data?.cards
                                  .filter((item) => !item.archived)
                                  .map((item) => (
                                    <option value={item.id} key={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                              </Select>
                            </label>
                            {destination === '__new__' && (
                              <>
                                <label>
                                  Nome do cartão
                                  <input
                                    required
                                    maxLength={100}
                                    value={newCardName}
                                    onChange={(e) => setNewCardName(e.target.value)}
                                  />
                                </label>
                                <div className="form-grid">
                                  <label>
                                    Fecha dia
                                    <input
                                      required
                                      type="number"
                                      min={1}
                                      max={31}
                                      value={closingDay}
                                      onChange={(e) => setClosingDay(e.target.value)}
                                    />
                                  </label>
                                  <label>
                                    Vence dia
                                    <input
                                      required
                                      type="number"
                                      min={1}
                                      max={31}
                                      value={dueDay}
                                      onChange={(e) => setDueDay(e.target.value)}
                                    />
                                  </label>
                                </div>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <label>
                              Conta de destino
                              <Select
                                value={destination}
                                disabled={busy}
                                onChange={(e) => setDestination(e.target.value)}
                              >
                                <option value="__new__">Criar conta a partir deste extrato</option>
                                {accounts.data
                                  ?.filter(
                                    (item) =>
                                      item.institution === detected.institution &&
                                      (detected.institution !== 'alelo' ||
                                        item.type === 'benefit_food'),
                                  )
                                  .map((item) => (
                                    <option value={item.id} key={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                              </Select>
                            </label>
                            {destination === '__new__' && (
                              <label>
                                Nome da nova conta
                                <input
                                  required
                                  maxLength={100}
                                  value={newAccountName}
                                  onChange={(e) => setNewAccountName(e.target.value)}
                                />
                              </label>
                            )}
                          </>
                        )}
                        {detectError && (
                          <p className="form-error" role="alert">
                            {detectError}
                          </p>
                        )}
                        <Button
                          disabled={
                            busy ||
                            !navigator.onLine ||
                            (detected.kind === 'card_invoice' &&
                              destination === '__new__' &&
                              !newCardName.trim()) ||
                            (detected.kind === 'account_statement' &&
                              destination === '__new__' &&
                              !newAccountName.trim())
                          }
                          onClick={() => void continueStatement()}
                        >
                          {busy
                            ? 'Preparando revisão…'
                            : detected.kind === 'card_invoice'
                              ? 'Ler e conciliar fatura'
                              : 'Continuar para revisar'}{' '}
                          <ArrowRight size={16} />
                        </Button>
                        <Button
                          className="secondary compact"
                          disabled={busy}
                          onClick={() => {
                            setSelectedFile(null);
                            setDetected(null);
                            setDetectError('');
                          }}
                        >
                          Escolher outro arquivo
                        </Button>
                      </>
                    ) : (
                      <>
                        {detectError && (
                          <p className="form-error" role="alert">
                            {detectError}
                          </p>
                        )}
                        <p className="field-help">
                          Esse formato ainda não foi mapeado. Você pode cadastrar conta e movimentos
                          manualmente.
                        </p>
                        <div className="inline-actions">
                          <Link className="button secondary" to="/accounts">
                            Adicionar conta manualmente
                          </Link>
                          <Link className="button secondary" to="/cards">
                            Adicionar cartão manualmente
                          </Link>
                          <Link className="button" to="/transactions">
                            Adicionar lançamento
                          </Link>
                        </div>
                        <Button
                          className="secondary compact"
                          onClick={() => {
                            setSelectedFile(null);
                            setDetectError('');
                          }}
                        >
                          Escolher outro arquivo
                        </Button>
                      </>
                    )}
                    {!cardPreview && (
                      <span className="field-help">
                        Primeiro identificamos o tipo de arquivo. Depois você escolhe um cadastro
                        existente ou cria um novo. PDF com texto, CSV UTF-8 ou XLSX · até 10 MB.
                      </span>
                    )}
                  </>
                )}
              </section>
              <details className="panel import-guide">
                <summary>Como funciona a importação</summary>
                <div className="import-guide-content">
                  <span className="eyebrow">VOCÊ NO CONTROLE</span>
                  <h2>Enviar. Revisar. Confirmar.</h2>
                  {[
                    {
                      n: '01',
                      title: 'Envie seu extrato',
                      text: 'Escolha o PDF, CSV ou XLSX e a conta à qual ele pertence.',
                    },
                    {
                      n: '02',
                      title: 'Confira os movimentos',
                      text: 'Revise receitas, despesas e transferências. Possíveis duplicidades ficam sinalizadas.',
                    },
                    {
                      n: '03',
                      title: 'Confirme quando estiver pronto',
                      text: 'Os lançamentos só entram no seu saldo depois da sua confirmação.',
                    },
                  ].map((step) => (
                    <div className="guide-step" key={step.n}>
                      <span>{step.n}</span>
                      <div>
                        <h3>{step.title}</h3>
                        <p>{step.text}</p>
                      </div>
                    </div>
                  ))}
                  <div className="guide-note">
                    <CheckCircle2 size={18} />
                    <p>
                      O arquivo original não fica armazenado. Mantemos os movimentos que você
                      confirmar e a referência da importação.
                    </p>
                  </div>
                </div>
              </details>
            </div>
            <UploadResults
              rows={uploads.rows}
              busy={busy}
              stopping={uploads.stopping}
              onStop={uploads.stop}
            />
          </div>
          <section hidden={view !== 'history'} className="panel history-panel">
            <div className="section-heading">
              <div>
                <h2>Suas importações</h2>
                <p>Revise o histórico e acompanhe cada arquivo.</p>
              </div>
            </div>
            {history.isPending ? (
              <Loading />
            ) : history.isError ? (
              <ErrorState error={history.error} />
            ) : history.data.length ? (
              history.data.map((item) => (
                <Link className="import-history-row" to={'/imports/' + item.id} key={item.id}>
                  <FileText size={20} />
                  <div>
                    <strong>{item.fileName}</strong>
                    <span>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <span className={`badge ${item.status === 'confirmed' ? 'success' : ''}`}>
                    {item.status === 'confirmed'
                      ? 'Confirmado'
                      : item.status === 'history'
                        ? 'Só consulta'
                        : item.status === 'reversed'
                          ? 'Desfeito'
                          : 'Em revisão'}
                  </span>
                  <ChevronRight size={16} />
                </Link>
              ))
            ) : (
              <EmptyState
                icon={<EmptyStateIcon size={28} strokeWidth={1.5} />}
                title="Seu histórico começa no primeiro arquivo"
              >
                Cada importação fica registrada para você conferir depois.
              </EmptyState>
            )}
          </section>
        </>
      )}
    </div>
  );
}
