import type { CardInvoiceLine, ParsedCardInvoice } from './card-invoice-reader.js';
import { date, installments, money, validate } from './invoice-values.js';

type Cell = { text: string; x: number; y: number };
const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rows(page: Cell[], left = -Infinity, right = Infinity) {
  const groups = new Map<number, Cell[]>();
  for (const cell of page.filter((cell) => cell.x >= left && cell.x < right)) {
    const y = Math.round(cell.y / 2) * 2;
    groups.set(y, [...(groups.get(y) ?? []), cell]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, cells]) =>
      cells
        .sort((a, b) => a.x - b.x)
        .map((cell) => cell.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
}

function purchase(rawDate: string, label: string, amount: number, month: string): CardInvoiceLine {
  const installment = label.match(/\s*\(Parcela (\d+) de (\d+)\)$/i);
  const info = installments(installment ? `${installment[1]}/${installment[2]}` : label);
  let purchaseDate = date(rawDate, month);
  if (rawDate.length === 5 && info.installmentNumber) {
    const [year, cycle] = month.split('-').map(Number);
    const firstCycle = new Date(Date.UTC(year, cycle - info.installmentNumber, 1))
      .toISOString()
      .slice(0, 7);
    purchaseDate = date(rawDate, firstCycle);
    if (purchaseDate.slice(0, 7) > firstCycle)
      purchaseDate = date(`${rawDate}/${Number(purchaseDate.slice(0, 4)) - 1}`, month);
  }
  return {
    date: purchaseDate,
    description: installment ? label.slice(0, installment.index).trim() : label.trim(),
    amount,
    ...info,
  };
}

function readInter(pages: Cell[][], billMonth: string): ParsedCardInvoice | null {
  const cover = rows(pages[0] ?? []).join(' ');
  if (
    !/Total da sua fatura/.test(cover) ||
    !/bancointer\.com\.br|inter\.co\//i.test(
      pages
        .flat()
        .map((cell) => cell.text)
        .join(' '),
    )
  )
    return null;
  const total = rows(pages[0] ?? [], -Infinity, 230)
    .join(' ')
    .match(/Total da sua fatura.*?R\$\s*([\d.]+,\d{2})/i);
  const due = cover.match(/Data de Vencimento.*?(\d{2}\/\d{2}\/\d{4})/i);
  if (!total || !due) return null;
  const dueDate = date(due[1], billMonth);
  billMonth = dueDate.slice(0, 7);
  const lines: CardInvoiceLine[] = [];
  const movements: NonNullable<ParsedCardInvoice['movements']> = [];
  let section = false;
  for (const page of pages) {
    for (const row of rows(page)) {
      if (/^Despesas da fatura$/i.test(row)) section = true;
      if (/^Próxima fatura$|^Limite de crédito total:/i.test(row)) section = false;
      if (!section) continue;
      const match = row.match(
        /^(\d{2}) de ([a-zç]{3})\.? (\d{4}) (.+?)\s+-\s+([+-]?\s*R\$\s*[\d.]+,\d{2})$/i,
      );
      if (!match) continue;
      const month = months.indexOf(match[2].toLowerCase());
      if (month < 0) continue;
      const rawDate = `${match[1]}/${String(month + 1).padStart(2, '0')}/${match[3]}`;
      const description = match[4].replace(/^P AGAMENTO/, 'PAGAMENTO');
      const value = match[5].replace(/^\+\s*/, '');
      if (/^PAGAMENTO\b/i.test(description)) {
        movements.push({
          date: date(rawDate, billMonth),
          description,
          amount: Math.abs(money(value)),
          kind: 'payment',
        });
      } else {
        // Inter prints a plus sign for credits, opposite to purchase amounts.
        lines.push(
          purchase(
            rawDate,
            description,
            money(value) * (match[5].startsWith('+') ? -1 : 1),
            billMonth,
          ),
        );
      }
    }
  }
  if (!lines.length) return null;
  return {
    ...validate(lines, billMonth, 'pdf', money(total[1])),
    institution: 'inter',
    dueDate,
    movements,
  };
}

function readItau(pages: Cell[][], billMonth: string): ParsedCardInvoice | null {
  const cover = rows(pages[0] ?? []).join(' ');
  if (!/Ita[uú]/i.test(cover) || !/Total desta fatura/.test(cover)) return null;
  const total = cover.match(/Total desta fatura\s+([\d.]+,\d{2})/i);
  const due = cover.match(/Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!total || !due) return null;
  const dueDate = date(due[1], billMonth);
  billMonth = dueDate.slice(0, 7);
  const lines: CardInvoiceLine[] = [];
  const movements: NonNullable<ParsedCardInvoice['movements']> = [];
  let section: 'purchases' | 'payments' | null = null;
  for (const page of pages.slice(1)) {
    // This layout has two independent columns. Offers on the right are not purchases.
    for (const row of rows(page, 120, 345)) {
      if (/^Lançamentos: compras e saques$/i.test(row)) section = 'purchases';
      if (/^Pagamentos efetuados$/i.test(row)) section = 'payments';
      if (
        /^(?:[PL] )?Total|^Lançamentos no cartão|^Limites de crédito|^Encargos cobrados/i.test(row)
      )
        section = null;
      const match = row.match(/^(\d{2}\/\d{2}) (.+?)\s+(-?[\d.]+,\d{2})$/);
      if (!section || !match) continue;
      if (section === 'payments')
        movements.push({
          date: date(match[1], billMonth),
          description: match[2],
          amount: Math.abs(money(match[3])),
          kind: 'payment',
        });
      else lines.push(purchase(match[1], match[2], money(match[3]), billMonth));
    }
  }
  if (!lines.length) return null;
  const result = validate(lines, billMonth, 'pdf', money(total[1]));
  if (lines.some((line) => line.installmentNumber))
    result.warnings.push(
      'O ano da compra parcelada sem data completa foi estimado. Confira antes de confirmar.',
    );
  return { ...result, institution: 'itau', dueDate, movements };
}

export function readDetailedInvoice(pages: Cell[][], billMonth: string) {
  return readInter(pages, billMonth) ?? readItau(pages, billMonth);
}
