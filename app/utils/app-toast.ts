/**
 * Nuxt UI 4's useToast() calls inject(), which only works inside setup() or the app context.
 * Use this from code that runs later (event handlers, async callbacks, plain utilities).
 */
export function useAppToast(): ReturnType<typeof useToast> {
  const nuxtApp = tryUseNuxtApp()
  return nuxtApp ? nuxtApp.runWithContext(() => useToast()) : useToast()
}
