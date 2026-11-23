import type { InputHTMLAttributes } from 'react';
import { parseMoney } from '../../formatting/money';

export function MoneyField({
  value,
  onValueChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <span className="money-field">
      <span aria-hidden="true">R$</span>
      <input
        {...props}
        inputMode="decimal"
        placeholder="0,00"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onBlur={() => {
          if (!value.trim()) return;
          try {
            const cents = parseMoney(value);
            const absolute = Math.abs(cents);
            const fraction = String(absolute % 100).padStart(2, '0');
            onValueChange(`${cents < 0 ? '-' : ''}${Math.trunc(absolute / 100)},${fraction}`);
          } catch {
            // Keep invalid input available for the form's validation.
          }
        }}
      />
    </span>
  );
}
