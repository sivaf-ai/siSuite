/**
 * MaterialPickerDialog — la STESSA lista Materiali in modalità SELEZIONE (popup),
 * riusata ovunque serva scegliere un articolo (righe di DDT, ordini d'acquisto,
 * pick list…). Standard: "una lista, ovunque" — qui EntityList in mode pick.
 *  - single (default): click su una riga → seleziona e chiude.
 *  - multi: spunta più righe → "Aggiungi selezionati".
 * Ritorna i MaterialDto completi (così il chiamante ha unità, nome, prezzi…).
 */
import { useState } from 'react';
import type { MaterialDto } from '@sisuite/shared';
import { EntityList, type ListColumn } from './EntityList';
import { Drawer } from './Drawer';
import { useApi } from '../api/hooks';

interface ListResp { items: MaterialDto[]; total: number; limit: number; offset: number }

const cols: ListColumn<MaterialDto>[] = [
  { key: 'name', header: 'Articolo', sub: 'codice', value: (m) => m.name, render: (m) => (
    <div className="two"><span className="a">{m.name}</span><span className="b mono">{m.code ?? '—'}</span></div>) },
  { key: 'sku', header: 'SKU / Barcode', value: (m) => m.sku ?? '', render: (m) => (
    <div className="two"><span className="a mono">{m.sku ?? '—'}</span><span className="b mono">{m.barcode ?? '—'}</span></div>) },
  { key: 'unit', header: 'Unità', value: (m) => m.unit, render: (m) => <span className="mono">{m.unit}</span> },
  { key: 'qty', header: 'Giacenza', num: true, value: (m) => m.qtyOnHand, render: (m) => (
    <span className="mono">{m.qtyOnHand.toLocaleString('it-IT')}</span>) },
];

export function MaterialPickerDialog({ open, multi = false, onClose, onPick }: {
  open: boolean; multi?: boolean; onClose: () => void; onPick: (mats: MaterialDto[]) => void;
}) {
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<Record<string, MaterialDto>>({});
  const limit = 10;

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q.trim()) params.set('q', q.trim());
  const { data, loading, error } = useApi<ListResp>(open ? `/materials?${params.toString()}` : null);
  const rows = data?.items ?? [];

  function toggle(m: MaterialDto) {
    if (!multi) { onPick([m]); reset(); onClose(); return; }
    setSel((s) => { const n = { ...s }; if (n[m.id]) delete n[m.id]; else n[m.id] = m; return n; });
  }
  function reset() { setSel({}); setQ(''); setOffset(0); }
  function confirm() { onPick(Object.values(sel)); reset(); onClose(); }

  return (
    <Drawer open={open} title="Seleziona articolo" onClose={() => { reset(); onClose(); }}
      footer={multi ? (
        <>
          <button className="btn btn-ghost" onClick={() => { reset(); onClose(); }}>Annulla</button>
          <button className="btn btn-primary" onClick={confirm} disabled={!Object.keys(sel).length}>
            Aggiungi {Object.keys(sel).length || ''} selezionati
          </button>
        </>
      ) : <button className="btn btn-ghost" onClick={() => { reset(); onClose(); }}>Annulla</button>}>
      <EntityList<MaterialDto>
        mode={multi ? 'pick-multi' : 'pick-single'}
        selectedIds={Object.keys(sel)}
        onToggleSelect={toggle}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca nome, codice, SKU, barcode…"
        columns={cols} rows={rows} loading={loading} error={error}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessun articolo." exportName="materiali"
      />
    </Drawer>
  );
}
