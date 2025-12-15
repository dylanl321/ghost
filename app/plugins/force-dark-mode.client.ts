/**
 * Force dark mode to always be active.
 * This prevents the browser's light mode preference from affecting the UI.
 */
export default defineNuxtPlugin(() => {
  // Ensure the dark class is always on the html element
  if (import.meta.client) {
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')

    // Also set the color-scheme to prevent browser UI from using light mode
    document.documentElement.style.colorScheme = 'dark'
  }
})
