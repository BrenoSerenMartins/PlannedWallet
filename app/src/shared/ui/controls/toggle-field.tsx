import type { ReactNode } from 'react';

export function ToggleField({
  children,
  checked,
  disabled,
  onChange,
}: {
  children: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <span>{children}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
