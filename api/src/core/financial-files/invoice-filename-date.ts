import { dateOnly } from '../rest/index.js';

export function invoiceFilenameDate(filename: string): string | null {
  const match = (filename.split(/[\\/]/).at(-1) ?? '').match(
    /^Fatura[_ -](20\d{2})-(0[1-9]|1[0-2])-(\d{2})\.csv$/i,
  );
  if (!match) return null;
  try {
    return dateOnly(`${match[1]}-${match[2]}-${match[3]}`);
  } catch {
    return null;
  }
}
