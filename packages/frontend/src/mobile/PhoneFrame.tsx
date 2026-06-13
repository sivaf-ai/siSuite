/** PhoneFrame — cornice "telefono" per mostrare la vista tecnico su PC nel demo
 *  (brief §4). Riproduce la scocca dei mockup 01/02/21/22: notch, status bar,
 *  area scroll e tab bar in basso. Su un telefono vero resta una cornice sottile. */
import type { ReactNode } from 'react';

export function PhoneFrame({ children, tabbar, caption }: { children: ReactNode; tabbar?: ReactNode; caption?: ReactNode }) {
  return (
    <div className="phone-stage">
      <div className="phone">
        <div className="notch" />
        <div className="status">
          <span className="mono">9:41</span>
          <span className="sigs">
            <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1" /><rect x="5" y="4" width="3" height="8" rx="1" /><rect x="10" y="1" width="3" height="11" rx="1" /><rect x="15" y="1" width="3" height="11" rx="1" opacity=".35" /></svg>
            <svg width="22" height="12" viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="1" y="2" width="19" height="8" rx="2" /><rect x="3" y="4" width="13" height="4" rx="1" fill="currentColor" stroke="none" /><rect x="21" y="4" width="2" height="4" rx="1" fill="currentColor" stroke="none" /></svg>
          </span>
        </div>
        <div className="screen">
          <div className="scroll">{children}</div>
          {tabbar}
        </div>
      </div>
      {caption}
    </div>
  );
}
