export default defineAppConfig({
  // https://ui.nuxt.com/docs/getting-started/theme/design-system
  ui: {
    colors: {
      primary: 'emerald',
      neutral: 'slate',
      // Tailwind palettes the app passes directly as `color` props (registered in nuxt.config `ui.theme.colors`)
      gray: 'slate',
      blue: 'blue',
      red: 'red',
      green: 'green',
      emerald: 'emerald',
      purple: 'purple',
      yellow: 'yellow',
      amber: 'amber',
      orange: 'orange',
      indigo: 'indigo',
      violet: 'violet',
      cyan: 'cyan',
      sky: 'sky',
      teal: 'teal',
      pink: 'pink',
      rose: 'rose',
      lime: 'lime',
      fuchsia: 'fuchsia'
    },
    card: {
      slots: {
        root: 'rounded-xl bg-white dark:bg-gray-800 ring-0 border border-gray-200 dark:border-gray-700',
        header: 'text-gray-900 dark:text-white',
        body: 'text-gray-900 dark:text-white'
      }
    },
    table: {
      slots: {
        base: 'font-medium text-xs text-gray-600 dark:text-gray-300 tracking-wide',
        th: 'uppercase text-xs text-gray-700 dark:text-gray-300 px-4 py-3',
        td: 'px-4 py-3'
      }
    },
    button: {
      slots: {
        base: 'rounded-lg'
      }
    },
    input: {
      slots: {
        base: 'rounded-lg'
      }
    },
    modal: {
      // Modals wrap a UCard in #content, so the card supplies the surface, border and rounding
      slots: {
        content: 'bg-transparent divide-y-0'
      },
      variants: {
        fullscreen: {
          false: {
            content: 'w-[calc(100vw-2rem)] max-w-lg rounded-xl shadow-xl'
          }
        }
      }
    },
    tooltip: {
      slots: {
        // v2 tooltips wrapped long text; v4 defaults to a single truncated line
        content: 'max-w-lg h-auto',
        text: 'whitespace-normal'
      }
    }
  }
})
