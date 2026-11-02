export default defineAppConfig({
  // https://ui.nuxt.com/docs/getting-started/theme/design-system
  ui: {
    // Nuxt UI 4 defaults to Lucide icons; map them to the Heroicons set the app already bundles.
    icons: {
      arrowDown: 'i-heroicons-arrow-down',
      arrowLeft: 'i-heroicons-arrow-left',
      arrowRight: 'i-heroicons-arrow-right',
      arrowUp: 'i-heroicons-arrow-up',
      caution: 'i-heroicons-exclamation-circle',
      check: 'i-heroicons-check',
      chevronDoubleLeft: 'i-heroicons-chevron-double-left',
      chevronDoubleRight: 'i-heroicons-chevron-double-right',
      chevronDown: 'i-heroicons-chevron-down',
      chevronLeft: 'i-heroicons-chevron-left',
      chevronRight: 'i-heroicons-chevron-right',
      chevronUp: 'i-heroicons-chevron-up',
      close: 'i-heroicons-x-mark',
      copy: 'i-heroicons-document-duplicate',
      copyCheck: 'i-heroicons-clipboard-document-check',
      dark: 'i-heroicons-moon',
      drag: 'i-heroicons-bars-2',
      ellipsis: 'i-heroicons-ellipsis-horizontal',
      error: 'i-heroicons-x-circle',
      external: 'i-heroicons-arrow-up-right',
      eye: 'i-heroicons-eye',
      eyeOff: 'i-heroicons-eye-slash',
      file: 'i-heroicons-document',
      folder: 'i-heroicons-folder',
      folderOpen: 'i-heroicons-folder-open',
      hash: 'i-heroicons-hashtag',
      info: 'i-heroicons-information-circle',
      light: 'i-heroicons-sun',
      loading: 'i-heroicons-arrow-path',
      menu: 'i-heroicons-bars-3',
      minus: 'i-heroicons-minus',
      panelClose: 'i-heroicons-chevron-double-left',
      panelOpen: 'i-heroicons-chevron-double-right',
      plus: 'i-heroicons-plus',
      reload: 'i-heroicons-arrow-path',
      search: 'i-heroicons-magnifying-glass',
      star: 'i-heroicons-star',
      stop: 'i-heroicons-stop',
      success: 'i-heroicons-check-circle',
      system: 'i-heroicons-computer-desktop',
      tip: 'i-heroicons-light-bulb',
      upload: 'i-heroicons-arrow-up-tray',
      warning: 'i-heroicons-exclamation-triangle',
      terminal: 'i-heroicons-command-line',
    },
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
    // Nuxt UI 2 form controls filled their container; v4 renders them inline-flex at content width.
    // Default them to full width (a width class on the component still wins), matching v2 layouts.
    textarea: { slots: { root: 'w-full' } },
    inputMenu: { slots: { root: 'w-full' } },
    inputNumber: { slots: { root: 'w-full' } },
    select: { slots: { base: 'w-full' } },
    selectMenu: { slots: { base: 'w-full' } },
    input: {
      slots: {
        root: 'w-full',
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
