/**
 * FormPage (standard 7) — pagina-form per entità ricche e documenti (mock 33).
 * Maschera centrale ben distribuita, sezioni in schede (.formcard), barra azioni
 * fissa in basso. NON un drawer stretto.
 */
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

export function FormPage({ back, backLabel, title, code, status, children, bar }: {
  back?: () => void; backLabel?: string; title: ReactNode; code?: ReactNode; status?: ReactNode;
  children: ReactNode; bar?: ReactNode;
}) {
  return (
    <div className="formpage">
      <div className="formpage-head">
        {back && <button className="back" onClick={back}><ChevronLeft size={16} /> {backLabel ?? 'Indietro'}</button>}
        <h1>{title}</h1>
        {code && <span className="code">{code}</span>}
        {status}
      </div>
      {children}
      {bar && <div className="formbar">{bar}</div>}
    </div>
  );
}

/** Una scheda/sezione della pagina-form. icon = lucide-react. */
export function FormCard({ icon, title, children, style }: { icon?: ReactNode; title: ReactNode; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="formcard" style={style}>
      <div className="ct">{icon}{title}</div>
      {children}
    </div>
  );
}
