/** GeneralSettings — "Generale" fedele al mock 18: righe set-row con i parametri
 *  dell'organizzazione. Alcuni valori sono informativi (la modifica persistente di
 *  lingua/fuso/orari è un passo successivo: alimenta il motore di pianificazione). */
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return <div className={`switch${on ? ' on' : ''}`} onClick={onToggle} role="switch" aria-checked={on} />;
}

export function GeneralSettings() {
  const { user } = useAuth();
  const [dark, setDark] = useState(false);
  const [push, setPush] = useState(true);
  const [portal, setPortal] = useState(false);

  return (
    <>
      <div className="panel">
        <div className="set-row"><div className="st"><b>Lingua dell'organizzazione</b><span>Lingua predefinita dell'interfaccia</span></div><span className="selv">{user?.locale ?? 'it-IT'}</span></div>
        <div className="set-row"><div className="st"><b>Fuso orario</b><span>Usato per pianificazione e scadenze</span></div><span className="selv">Europe/Rome</span></div>
        <div className="set-row"><div className="st"><b>Orario di lavoro</b><span>Fascia operativa standard del team</span></div><span className="selv">Lun–Ven · 08:00–18:00</span></div>
        <div className="set-row"><div className="st"><b>Valuta</b><span>Per preventivi e costi</span></div><span className="selv">EUR €</span></div>
        <div className="set-row"><div className="st"><b>Tema scuro</b><span>Segui le impostazioni di sistema</span></div><Switch on={dark} onToggle={() => setDark((x) => !x)} /></div>
        <div className="set-row"><div className="st"><b>Notifiche push</b><span>Avvisi su scadenze e nuove catture</span></div><Switch on={push} onToggle={() => setPush((x) => !x)} /></div>
        <div className="set-row"><div className="st"><b>Portale cliente</b><span>Abilita l'accesso esterno ai referenti</span></div><Switch on={portal} onToggle={() => setPortal((x) => !x)} /></div>
      </div>
      <p className="faint" style={{ fontSize: 13, marginTop: 14, color: 'var(--ink-faint)' }}>
        L'<b>orario di lavoro</b> e il fuso alimentano il motore di pianificazione: le attività si collocano solo nelle fasce disponibili.
        La persistenza di questi parametri (oggi informativi) è un passo successivo.
      </p>
    </>
  );
}
