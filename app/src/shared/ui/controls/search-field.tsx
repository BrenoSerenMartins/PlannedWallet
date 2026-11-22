import { Search } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';

export function SearchField(props: ComponentPropsWithoutRef<'input'>) {
  return (
    <label className="search-field shared-search-field">
      <Search size={17} aria-hidden="true" />
      <input type="search" {...props} />
    </label>
  );
}
