import { UnprocessableEntityException } from '@nestjs/common';
export interface PdfCredentials {
  password?: string;
  cpf?: string;
}
export function pdfPasswords({ password, cpf }: PdfCredentials = {}): string[] {
  if (password !== undefined && (typeof password !== 'string' || password.length > 128))
    throw new UnprocessableEntityException('A senha do PDF deve ter até 128 caracteres.');
  if (cpf !== undefined && (typeof cpf !== 'string' || cpf.length > 32))
    throw new UnprocessableEntityException(
      'Informe os 11 dígitos do CPF ou deixe o campo em branco.',
    );
  const digits = (cpf ?? '').replace(/[.\-\s]/g, '');
  if (digits && !/^\d{11}$/.test(digits))
    throw new UnprocessableEntityException(
      'Informe os 11 dígitos do CPF ou deixe o campo em branco.',
    );
  const options = password ? [password] : [];
  if (digits) {
    options.push(digits);
    for (const size of [5, 4, 6, 3, 7, 8, 9, 10])
      options.push(digits.slice(0, size), digits.slice(-size));
  }
  return [...new Set(options)];
}
