export default defineAppConfig({
  // https://ui.nuxt.com/getting-started/theme#design-system
  ui: {
    primary: 'emerald',
    gray: 'slate',
    card: {
      background: 'dark:bg-[#0e1625] border-2 border-gray-800',
    },
    table: {
      base: 'font-medium text-xs text-gray-300 tracking-wider',
      th: {
        base: 'uppercase',
        color: 'dark:text-gray-300',
        size: 'text-xs'
      }
    }
  }
})
