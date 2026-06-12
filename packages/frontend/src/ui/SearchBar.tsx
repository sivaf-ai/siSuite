import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

/** Ricerca con icona + debounce 300ms + clear. */
export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setLocal(value), [value]);

  function update(v: string) {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), 300);
  }
  return (
    <div className="search">
      <Search size={17} />
      <input value={local} placeholder={placeholder ?? 'Cerca…'} onChange={(e) => update(e.target.value)} />
      {local && <X size={16} style={{ cursor: 'pointer' }} onClick={() => { setLocal(''); onChange(''); }} />}
    </div>
  );
}
