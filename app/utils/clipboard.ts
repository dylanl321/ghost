/**
 * Clipboard helper shared by every copy button in the app
 */

const logger = createLogger('Clipboard')

/**
 * Copy text to clipboard with toast notification
 * Returns true if successful, false otherwise
 */
export async function copyToClipboard(text: string, successMessage?: string): Promise<boolean> {
  // Resolve the toast before the first await so the Nuxt app context is still available
  const toast = useToast()
  try {
    await navigator.clipboard.writeText(text)

    toast.add({
      title: successMessage || 'Copied to clipboard',
      icon: 'i-heroicons-check-circle',
      color: 'green',
      timeout: 2000
    })

    return true
  } catch (error) {
    logger.error('Failed to copy to clipboard:', error)

    toast.add({
      title: 'Failed to copy',
      description: 'Unable to copy to clipboard',
      icon: 'i-heroicons-x-circle',
      color: 'red',
      timeout: 3000
    })

    return false
  }
}
