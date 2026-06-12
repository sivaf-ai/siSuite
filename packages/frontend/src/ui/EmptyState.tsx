import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';

export function EmptyState({ icon: Icon, title, hint, onNew, newLabel }:
  { icon: LucideIcon; title: string; hint?: string; onNew?: () => void; newLabel?: string }) {
  return (
    <div className="empty-state">
      <div className="ic"><Icon size={26} /></div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {onNew && (
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={onNew}>
          <Plus size={17} /> {newLabel ?? 'Nuovo'}
        </button>
      )}
    </div>
  );
}
