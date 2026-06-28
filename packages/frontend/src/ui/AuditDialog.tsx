/**
 * AuditDialog — storico azioni di un record (soft-delete e non).
 * Modal centrato che carica GET /audit?entity=&entityId= e mostra una timeline
 * con azione tradotta in IT, autore (userName) e data/ora formattata.
 */
import { useTranslation } from 'react-i18next';
import type { AuditActionDto, AuditEntryDto } from '@sisuite/shared';
import { useApi } from '../api/hooks';
import { Modal } from './Modal';
import { Loading, ErrorBox } from '../components/Page';
import { History } from 'lucide-react';

const ACTION_LABEL: Record<AuditActionDto, string> = {
  create: 'Creato',
  update: 'Modificato',
  archive: 'Archiviato',
  restore: 'Ripristinato',
  purge: 'Eliminato definitivamente',
  delete: 'Eliminato',
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function AuditDialog({ entity, entityId, title, onClose }: {
  entity: string; entityId: string; title?: string; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, loading, error } = useApi<AuditEntryDto[]>(
    `/audit?entity=${encodeURIComponent(entity)}&entityId=${encodeURIComponent(entityId)}`,
  );
  const items = data ?? [];

  return (
    <Modal open size="md" title={title ? `Storico · ${title}` : (t('audit.title') ?? 'Storico')} onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : (
        items.length === 0 ? (
          <div className="dsx-empty" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-soft)' }}>
            Nessuna azione registrata
          </div>
        ) : (
          <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((it) => (
              <div key={it.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 4px',
                borderBottom: '1px solid var(--line)',
              }}>
                <span style={{
                  width: 30, height: 30, flex: '0 0 auto', borderRadius: 8, marginTop: 2,
                  background: 'var(--surface-soft, #f3f4f6)', color: 'var(--ink-soft)',
                  display: 'grid', placeItems: 'center',
                }}><History size={15} /></span>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{ACTION_LABEL[it.action] ?? it.action}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    {it.userName ?? '—'} · {fmt(it.at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </Modal>
  );
}
