export function needsPdfPassword(message: string | null | undefined) {
  return /^(?:PDF|Arquivo) protegido\b/i.test(message ?? '');
}
