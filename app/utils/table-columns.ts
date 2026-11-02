import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'

/**
 * Column definition in the shape the app used with Nuxt UI 2's UTable.
 * `class` styles the header cell and `rowClass` styles the body cells.
 */
export interface LegacyTableColumn {
  key: string
  label?: string
  sortable?: boolean
  class?: string
  rowClass?: string
  [extra: string]: unknown
}

/**
 * Convert v2-style `{ key, label, sortable }` columns into Nuxt UI 4 (TanStack) columns.
 * Sortable columns get a header button that cycles ascending, descending and unsorted,
 * matching the v2 behaviour.
 */
export function toTableColumns<T = any>(columns: readonly LegacyTableColumn[]): TableColumn<T>[] {
  return columns.map((col) => {
    const label = col.label ?? ''
    const meta = (col.class || col.rowClass)
      ? { class: { th: col.class ?? '', td: col.rowClass ?? '' } }
      : undefined

    const column: TableColumn<T> = {
      id: col.key,
      accessorKey: col.key,
      enableSorting: Boolean(col.sortable),
      ...(meta ? { meta } : {})
    } as TableColumn<T>

    column.header = col.sortable
      ? ({ column: c }) => {
          const sorted = c.getIsSorted()
          return h(resolveComponent('UButton'), {
            color: 'neutral',
            variant: 'ghost',
            size: 'xs',
            label,
            class: '-mx-2.5 font-semibold uppercase text-xs',
            trailingIcon: sorted
              ? (sorted === 'asc' ? 'i-heroicons-bars-arrow-up-20-solid' : 'i-heroicons-bars-arrow-down-20-solid')
              : 'i-heroicons-arrows-up-down-20-solid',
            onClick: () => c.toggleSorting(c.getIsSorted() === 'asc')
          })
        }
      : label

    return column
  })
}
