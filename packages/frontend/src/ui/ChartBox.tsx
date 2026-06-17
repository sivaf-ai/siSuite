/**
 * ChartBox — contenitore per grafici recharts che renderizza il chart SOLO quando
 * il box ha dimensioni reali (>0). Evita il warning recharts "width(0) height(0)"
 * quando la pagina è montata ma nascosta (Ionic tiene le route in DOM) o al primo
 * paint prima del layout. Usa ResizeObserver.
 */
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

export function ChartBox({ height, style, children }: { height: number; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sized, setSized] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') { setSized(true); return; }
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      setSized(!!cr && cr.width > 0 && cr.height > 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} className="pb" style={{ height, ...style }}>{sized ? children : null}</div>;
}
