export function needsPdfPassword(message: string | null | undefined) {
  return /^PDF protegido\b/i.test(message ?? '');
}
