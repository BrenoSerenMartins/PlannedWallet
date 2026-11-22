import { useEffect, useRef, useState } from 'react';
import { request } from '../../../shared/api/client';
import { getRequestWorkspace } from '../../../shared/api/workspace-selection';
import {
  createDestination,
  findDestinations,
  importInvoice,
  importStatement,
  sourceForm,
  type AutomaticImportRow,
  type DetectedImport,
  type ImportDestination,
} from '../services/automatic-import-batch';

export function useAutomaticImportBatch(onComplete: () => void) {
  const [rows, setRows] = useState<AutomaticImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const mounted = useRef(true);
  const workspace = useRef<string | null>(null);
  const password = useRef('');
  const cpfSecret = useRef('');
  const stopped = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopped.current = true;
      password.current = '';
      cpfSecret.current = '';
    };
  }, []);
  const active = () => {
    if (!mounted.current || stopped.current || getRequestWorkspace() !== workspace.current)
      throw new Error('Processamento interrompido; o espaço mudou ou o lote foi pausado.');
  };
  function stop() {
    stopped.current = true;
    password.current = '';
    cpfSecret.current = '';
  }
  async function analyze(files: File[], secret: string, cpf = '') {
    if (running.current) return;
    setError('');
    if (files.length > 20 || files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) {
      setError('Selecione até 20 arquivos e 100 MB por lote.');
      return;
    }
    workspace.current = getRequestWorkspace();
    password.current = secret;
    cpfSecret.current = cpf;
    stopped.current = false;
    running.current = true;
    setBusy(true);
    const queue: AutomaticImportRow[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: 'queued',
    }));
    const seen = new Set<string>();
    setRows([...queue]);
    for (const row of queue) {
      try {
        active();
        row.status = 'analyzing';
        setRows([...queue]);
        if (!row.file.size || row.file.size > 10 * 1024 * 1024)
          throw new Error('Cada arquivo deve ter conteúdo e até 10 MB.');
        const fingerprint = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', await row.file.arrayBuffer())),
        )
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
        active();
        if (seen.has(fingerprint)) {
          row.status = 'duplicate';
          row.message = 'Arquivo repetido no lote.';
          continue;
        }
        seen.add(fingerprint);
        row.detected = await request<DetectedImport>('/imports/detect', {
          method: 'POST',
          body: sourceForm(row.file, secret, cpf),
        });
        active();
        if (
          !row.detected.institution ||
          row.detected.summaryOnly ||
          (row.detected.kind === 'card_invoice' && !row.detected.automaticMonth)
        ) {
          row.status = 'review';
          row.message = 'Faltam banco, mês ou lançamentos confiáveis neste arquivo.';
          continue;
        }
        const destinations = await findDestinations(row.detected);
        active();
        if (destinations.length > 1) {
          row.status = 'review';
          row.message =
            'Há mais de um destino possível neste banco. Escolha pela importação individual.';
          continue;
        }
        row.destination = destinations[0];
        row.status = 'ready';
      } catch (cause) {
        row.status = 'error';
        row.message =
          cause instanceof Error ? cause.message : 'Não foi possível analisar o arquivo.';
      } finally {
        if (mounted.current && getRequestWorkspace() === workspace.current) setRows([...queue]);
      }
      if (stopped.current || !mounted.current || getRequestWorkspace() !== workspace.current) break;
    }
    running.current = false;
    if (mounted.current) setBusy(false);
  }
  async function confirm() {
    if (running.current) return;
    const queue = [...rows];
    const destinations = new Map<string, ImportDestination>();
    running.current = true;
    stopped.current = false;
    setBusy(true);
    const ordered = queue
      .filter((row) => row.status === 'ready')
      .sort((a, b) =>
        `${a.detected?.kind === 'card_invoice' ? 0 : 1}:${a.detected?.automaticMonth ?? a.detected?.periodStart ?? ''}`.localeCompare(
          `${b.detected?.kind === 'card_invoice' ? 0 : 1}:${b.detected?.automaticMonth ?? b.detected?.periodStart ?? ''}`,
        ),
      );
    for (const row of ordered) {
      try {
        active();
        row.status = 'importing';
        setRows([...queue]);
        const key = `${row.detected!.kind}:${row.detected!.institution}`;
        let destination = row.destination ?? destinations.get(key);
        if (!destination) {
          const matches = await findDestinations(row.detected!);
          active();
          if (matches.length > 1)
            throw new Error('O destino mudou. Revise o arquivo individualmente.');
          destination = matches[0];
          if (!destination) {
            active();
            destination = await createDestination(row.detected!, `batch:${row.id}`);
            active();
          }
        }
        destinations.set(key, destination);
        row.destination = destination;
        const result =
          row.detected!.kind === 'card_invoice'
            ? await importInvoice(row, destination, password.current, active, cpfSecret.current)
            : await importStatement(row, destination, `batch:${row.id}`, active, {
                password: password.current,
                cpf: cpfSecret.current,
              });
        Object.assign(row, result);
      } catch (cause) {
        row.status = 'error';
        row.message =
          cause instanceof Error ? cause.message : 'Não foi possível importar este arquivo.';
      } finally {
        if (mounted.current && getRequestWorkspace() === workspace.current) setRows([...queue]);
      }
      if (stopped.current || !mounted.current || getRequestWorkspace() !== workspace.current) break;
    }
    if (
      !queue.some(
        (row) => row.status === 'review' || row.status === 'error' || row.status === 'ready',
      )
    ) {
      password.current = '';
      cpfSecret.current = '';
    }
    running.current = false;
    if (mounted.current) {
      setBusy(false);
      if (getRequestWorkspace() === workspace.current) onComplete();
    }
  }
  return {
    rows,
    busy,
    error,
    analyze,
    confirm,
    stop,
    reviewCredentials: () => ({ password: password.current, cpf: cpfSecret.current }),
  };
}
