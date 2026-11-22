import { needsPdfPassword } from '../../../shared/api/pdf-password';
import { cardArtwork, issuerLogos } from '../../cards/art/catalog';
import { money } from '../../../shared/formatting/money';
import '../automatic-import.css';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../shared/ui/primitives';
import { importBanks, type AutomaticImportRow } from '../services/automatic-import-batch';
import type { useAutomaticImportBatch } from '../hooks/use-automatic-import-batch';

const states = {
  queued: 'Na fila',
  analyzing: 'Identificando…',
  ready: 'Pronto',
  duplicate: 'Repetido',
  importing: 'Importando…',
  imported: 'Importado',
  review: 'Revisão necessária',
  error: 'Não importado',
};
export function AutomaticImportBatch({
  batch,
  onSelect,
  onReview,
}: {
  batch: ReturnType<typeof useAutomaticImportBatch>;
  onSelect: (password: string, cpf: string) => void;
  onReview: (row: AutomaticImportRow) => void;
}) {
  const [password, setPassword] = useState('');
  const [cpf, setCpf] = useState('');
  const ready = batch.rows.filter((row) => row.status === 'ready').length;
  return (
    <section className="panel automatic-import-batch" aria-label="Importação automática em lote">
      <h2>Selecione seus arquivos</h2>
      <p>
        Envie um arquivo ou um lote. Identificamos o banco, o mês e se é extrato ou fatura. Você
        confere o resultado antes de importar.
      </p>
      {batch.rows.some((row) => needsPdfPassword(row.message)) && (
        <>
          <p>
            Para usar a mesma senha nos PDFs protegidos, informe os dados e selecione os arquivos de
            novo. Você também pode revisar cada arquivo protegido separadamente.
          </p>
          <label>
            CPF do titular para PDFs protegidos (opcional)
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              value={cpf}
              disabled={batch.busy}
              onChange={(event) => setCpf(event.target.value)}
            />
          </label>
          <label>
            Senha dos PDFs do lote (opcional)
            <input
              type="password"
              autoComplete="off"
              maxLength={128}
              value={password}
              disabled={batch.busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </>
      )}
      <div className="inline-actions">
        <Button
          disabled={batch.busy}
          onClick={() => {
            onSelect(password, cpf);
            setCpf('');
            setPassword('');
          }}
        >
          Selecionar arquivos em lote
        </Button>
        {ready > 0 && (
          <Button disabled={batch.busy} onClick={() => void batch.confirm()}>
            Importar {ready} arquivo(s) identificado(s)
          </Button>
        )}
        {batch.busy && (
          <Button className="secondary" onClick={batch.stop}>
            Pausar lote
          </Button>
        )}
      </div>
      <p className="field-help">
        PDF com texto, CSV ou XLSX · até 20 arquivos · 10 MB por arquivo · 100 MB por lote.
      </p>
      {batch.error && <p role="alert">{batch.error}</p>}
      <ul className="automatic-import-rows" aria-live="polite">
        {batch.rows.map((row) => (
          <li key={row.id}>
            <strong>{row.file.name}</strong>
            <span>{states[row.status]}</span>
            {row.detected && (
              <p className="automatic-import-bank">
                {row.detected.kind === 'card_invoice' &&
                  issuerLogos[row.detected.institution ?? ''] && (
                    <img
                      src={issuerLogos[row.detected.institution ?? '']}
                      alt=""
                      width={24}
                      height={24}
                    />
                  )}
                {(row.detected.artwork && cardArtwork[row.detected.artwork]?.label) ||
                  importBanks[row.detected.institution ?? ''] ||
                  'Banco não identificado'}{' '}
                · {row.detected.kind === 'card_invoice' ? 'Fatura' : 'Extrato'} ·{' '}
                {row.detected.automaticMonth ??
                  row.detected.months?.join(', ') ??
                  'Mês não identificado'}{' '}
                · {row.detected.itemCount} movimentos
              </p>
            )}
            {row.detected?.total !== undefined && (
              <p>Total da fatura: {money(row.detected.total)}</p>
            )}
            {row.detected?.closingBalance != null && (
              <p>Saldo final do arquivo: {money(row.detected.closingBalance)}</p>
            )}
            {row.detected?.warnings?.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            {row.destination && <p>Destino: {row.destination.name}</p>}
            {row.detected?.kind === 'card_invoice' &&
              !row.destination &&
              row.status === 'ready' && (
                <p>
                  Será criado um cartão para este banco. O fechamento não informado usará o dia 1
                  até você ajustar o cadastro.
                </p>
              )}
            {row.detected?.monthSource === 'filename' && (
              <p>
                Mês identificado pelo nome do arquivo exportado; confira se ele não foi renomeado.
              </p>
            )}
            {row.message && <p>{row.message}</p>}
            {row.reviewUrl &&
              (row.detected?.kind !== 'card_invoice' || row.status === 'imported') && (
                <Link to={row.reviewUrl}>
                  {row.status === 'imported' ? 'Ver importação' : 'Revisar este arquivo'}
                </Link>
              )}
            {(row.status === 'review' || row.status === 'error') &&
              (!row.reviewUrl || row.detected?.kind === 'card_invoice') && (
                <Button
                  className="secondary compact"
                  disabled={batch.busy}
                  onClick={() => onReview(row)}
                >
                  Revisar individualmente
                </Button>
              )}
          </li>
        ))}
      </ul>
    </section>
  );
}
