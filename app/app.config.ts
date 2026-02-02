export default defineAppConfig({
  // https://ui.nuxt.com/getting-started/theme#design-system
  ui: {
    primary: 'emerald',
    gray: 'slate',
    notifications: {
      // Show toasts at the top right of the screen
      position: 'top-0 bottom-[unset]'
    },
    // card: {
    //   base: 'overflow-hidden',
    //   background: 'bg-white dark:bg-slate-800',
    //   divide: 'divide-y divide-gray-200 dark:divide-gray-700',
    //   ring: 'ring-1 ring-gray-200 dark:ring-gray-700',
    //   rounded: 'rounded-xl',
    //   shadow: 'shadow-sm hover:shadow-md transition-shadow duration-200',
    // },
    card: {
      background: 'bg-white dark:bg-[#0e1625] border border-gray-200 dark:border-gray-800',
      body: {
        base: 'text-gray-900 dark:text-white',
      },
      header: {
        base: 'text-gray-900 dark:text-white',
      },
    },
    table: {
      base: 'font-medium text-xs text-gray-600 dark:text-gray-300 tracking-wide',
      th: {
        base: 'uppercase',
        color: 'text-gray-700 dark:text-gray-300',
        size: 'text-xs',
        padding: 'px-4 py-3'
      },
      td: {
        padding: 'px-4 py-3'
      }
    },
    button: {
      rounded: 'rounded-lg',
    },
    input: {
      rounded: 'rounded-lg',
    },
    tooltip: {
      width: 'max-w-lg'
    }
  }
})
