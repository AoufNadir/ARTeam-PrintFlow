import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** hover-revealed actions slot per row */
  rowActions?: (row: T) => ReactNode;
  empty?: ReactNode;
  className?: string;
}

/** RTL table: sticky header, row hover paper-100, LTR tabular numeric columns. */
export default function DataTable<T>({ columns, rows, rowKey, onRowClick, rowActions, empty, className }: DataTableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className={cn('overflow-x-auto rounded-[10px] border border-[var(--line)]', className)}>
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 bg-[var(--paper-100)]">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'px-3 py-2.5 text-start text-[11px] font-medium tracking-[0.04em] text-[var(--ink-400)]',
                  c.numeric && 'text-end',
                )}
              >
                {c.header}
              </th>
            ))}
            {rowActions && <th scope="col" className="w-24"><span className="sr-only">إجراءات</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        // don't hijack keys meant for inner action buttons
                        if (e.target !== e.currentTarget) return;
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              className={cn(
                'group border-t border-[var(--line)] bg-white transition-colors hover:bg-[var(--paper-100)]',
                onRowClick && 'cursor-pointer',
              )}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-3 py-2.5 align-middle text-[var(--ink-700)]', c.numeric && 'text-end', c.className)}>
                  {c.numeric ? (
                    <span dir="ltr" className="font-latin tabular-nums">
                      {c.render(row)}
                    </span>
                  ) : (
                    c.render(row)
                  )}
                </td>
              ))}
              {rowActions && (
                <td className="px-2 py-2">
                  {/* visible on row hover, on keyboard focus-within, and always on touch (hover:none) */}
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                    {rowActions(row)}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
