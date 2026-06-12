import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { SearchBar } from './SearchBar';

export function Toolbar({ search, onSearch, searchPlaceholder, onNew, newLabel, extra, canNew = true }:
  { search: string; onSearch: (v: string) => void; searchPlaceholder?: string; onNew?: () => void; newLabel?: string; extra?: ReactNode; canNew?: boolean }) {
  return (
    <div className="toolbar">
      <SearchBar value={search} onChange={onSearch} placeholder={searchPlaceholder} />
      {extra}
      <div className="spacer" />
      {onNew && canNew && (
        <button className="btn btn-primary" onClick={onNew}><Plus size={17} />{newLabel ?? 'Nuovo'}</button>
      )}
    </div>
  );
}
