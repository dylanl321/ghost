/**
 * Nuxt UI 4 tabs and accordions default each item's value to String(index), but the app
 * tracks the active item as a numeric index (the Nuxt UI 2 behaviour). Give every item its
 * numeric index as `value` unless it already has one.
 */
export function withIndexValues<T extends object>(items: readonly T[]): (T & { value: string | number })[] {
  return items.map((item, index) => ({ ...item, value: (item as { value?: string | number }).value ?? index }))
}
