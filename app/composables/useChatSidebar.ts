/**
 * Chat Sidebar State Composable
 * Manages sidebar visibility and first-visit welcome behavior
 */

export function useChatSidebar() {
  const isOpen = useState('chatSidebarOpen', () => false)
  const hasSeenWelcome = useState('chatSidebarHasSeenWelcome', () => true)

  /**
   * Initialize sidebar state on mount
   * Opens sidebar automatically on first visit
   */
  function initialize() {
    if (process.client) {
      const firstVisitKey = 'ghost-chat-sidebar-first-visit'
      const hasVisited = localStorage.getItem(firstVisitKey)

      if (!hasVisited) {
        // First time user - show welcome message and open sidebar
        isOpen.value = true
        hasSeenWelcome.value = false
        localStorage.setItem(firstVisitKey, Date.now().toString())
      } else {
        // Returning user - sidebar closed by default
        isOpen.value = false
        hasSeenWelcome.value = true
      }
    }
  }

  /**
   * Toggle sidebar visibility
   */
  function toggle() {
    isOpen.value = !isOpen.value

    // Mark welcome as seen when user opens sidebar
    if (isOpen.value && !hasSeenWelcome.value) {
      hasSeenWelcome.value = true
    }
  }

  /**
   * Open sidebar
   */
  function open() {
    isOpen.value = true

    if (!hasSeenWelcome.value) {
      hasSeenWelcome.value = true
    }
  }

  /**
   * Close sidebar
   */
  function close() {
    isOpen.value = false
  }

  return {
    isOpen,
    hasSeenWelcome,
    initialize,
    toggle,
    open,
    close
  }
}
