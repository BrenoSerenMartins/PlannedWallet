import { expect, it } from 'vitest';
import { pdfPasswords } from '../pdf-passwords.js';
it('uses an explicit password followed by bounded CPF-derived variants without duplicates', () => {
  const result = pdfPasswords({ password: 'custom-example', cpf: '123.456.789-00' });
  expect(result[0]).toBe('custom-example');
  expect(result).toEqual(
    expect.arrayContaining(['12345678900', '123456', '12345', '1234', '8900']),
  );
  expect(result.length).toBeLessThanOrEqual(18);
  expect(new Set(result).size).toBe(result.length);
  expect(pdfPasswords()).toEqual([]);
});
it('rejects malformed CPF and overlong password inputs', () => {
  expect(() => pdfPasswords({ cpf: '12345' })).toThrow('11 dígitos');
  expect(() => pdfPasswords({ cpf: 'abc12345678900' })).toThrow('11 dígitos');
  expect(() => pdfPasswords({ password: 'x'.repeat(129) })).toThrow('128');
});
