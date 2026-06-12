import { useState, type ReactNode } from 'react';

export interface KV { k: string; v: ReactNode }

/** Testata dettaglio: codice + titolo + stato + griglia chiave/valore + tab. */
export function DetailLayout({ code, title, status, kv, tabs, actions }:
  { code?: string; title: string; status?: ReactNode; kv?: KV[]; tabs?: { key: string; label: string; content: ReactNode }[]; actions?: ReactNode }) {
  const [tab, setTab] = useState(tabs?.[0]?.key ?? '');
  return (
    <>
      <div className="detail-head">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            {code && <span className="code">{code}</span>}
            <h1>{title}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{status}{actions}</div>
        </div>
        {kv && kv.length > 0 && (
          <div className="kv">
            {kv.map((x, i) => <div key={i}><div className="k">{x.k}</div><div className="v">{x.v}</div></div>)}
          </div>
        )}
      </div>

      {tabs && tabs.length > 0 && (
        <>
          <div className="detail-tabs">
            {tabs.map((t) => <a key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</a>)}
          </div>
          {tabs.find((t) => t.key === tab)?.content}
        </>
      )}
    </>
  );
}
