import type { ReactNode } from 'react';
import { ArrowUpDown, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right';
}
export interface RowAction<T> {
  icon: LucideIcon;
  label: string;
  onClick: (row: T) => void;
  danger?: boolean;
  /** nascondi l'azione per righe specifiche (es. di sistema, non modificabili). */
  hidden?: (row: T) => boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  actions?: RowAction<T>[];
  onRowClick?: (row: T) => void;
  total?: number;
  limit?: number;
  offset?: number;
  onPage?: (offset: number) => void;
  empty?: ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns, rows, loading, sortBy, sortDir, onSort, actions, onRowClick, total, limit, offset, onPage, empty,
}: Props<T>) {
  const colCount = columns.length + (actions ? 1 : 0);
  const showPager = total != null && limit != null && offset != null && onPage && total > limit;

  return (
    <>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}
                  className={c.sortable ? 'sortable' : ''}
                  style={{ textAlign: c.align ?? 'left' }}
                  onClick={() => c.sortable && onSort?.(c.key)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {c.header}
                    {c.sortable && (sortBy === c.key
                      ? (sortDir === 'asc' ? <ChevronDown size={13} style={{ transform: 'rotate(180deg)' }} /> : <ChevronDown size={13} />)
                      : <ArrowUpDown size={12} style={{ opacity: .4 }} />)}
                  </span>
                </th>
              ))}
              {actions && <th style={{ width: 1 }} />}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: colCount }).map((__, j) => (
                    <td key={j}><div className="skel" style={{ height: 14, width: j === 0 ? '60%' : '40%' }} /></td>
                  ))}
                </tr>
              ))
              : rows.length === 0
                ? <tr><td colSpan={colCount} style={{ padding: 0 }}>{empty}</td></tr>
                : rows.map((row) => (
                  <tr key={row.id} style={onRowClick ? { cursor: 'pointer' } : undefined} onClick={() => onRowClick?.(row)}>
                    {columns.map((c) => (
                      <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                        {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                      </td>
                    ))}
                    {actions && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          {actions.filter((a) => !a.hidden?.(row)).map((a) => (
                            <div key={a.label} className={`act-icon${a.danger ? ' danger' : ''}`} title={a.label} onClick={() => a.onClick(row)}>
                              <a.icon size={16} />
                            </div>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {showPager && (
        <div className="pagination">
          <span>{offset! + 1}–{Math.min(offset! + limit!, total!)} di {total}</span>
          <div className="pg-btns">
            <button className="btn btn-ghost btn-sm" disabled={offset! <= 0} onClick={() => onPage!(Math.max(0, offset! - limit!))}>
              <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /> Prec.
            </button>
            <button className="btn btn-ghost btn-sm" disabled={offset! + limit! >= total!} onClick={() => onPage!(offset! + limit!)}>
              Succ. <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
