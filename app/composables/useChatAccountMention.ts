/**
 * Chat Account Mention Composable
 * Handles @ mention functionality for account selection in chat
 */

import type { AWSEnclaveData } from '#shared/types/accounts'

export function useChatAccountMention() {
  const enclaveStore = useEnclaveStore()

  // State
  const showMentionDropdown = ref(false)
  const mentionQuery = ref('')
  const mentionPosition = ref(0)
  const selectedAccountForMessage = ref<AWSEnclaveData | null>(null)
  const filteredAccounts = ref<AWSEnclaveData[]>([])
  const selectedMentionIndex = ref(0)

  /**
   * Search accounts based on query
   * Uses search-first UX: requires at least 1 character to show results
   */
  function searchAccounts(query: string): AWSEnclaveData[] {
    const enclaves = Object.values(enclaveStore.enclaves || {})

    // Filter out decommissioned accounts
    const activeEnclaves = enclaves.filter(e => {
      const enclaveStatus = (e.enclaveStatus || '').toLowerCase()
      const accountStatus = (e.accountStatus || '').toLowerCase()
      return !enclaveStatus.includes('decommission') &&
        !accountStatus.includes('decommission')
    })

    // Require at least 1 character to search (search-first UX)
    if (!query || query.length === 0) {
      return []
    }

    const lowerQuery = query.toLowerCase()
    return activeEnclaves
      .filter(e =>
        e.projectName?.toLowerCase().includes(lowerQuery) ||
        e.awsGovCloudAccountID?.includes(query) ||
        e.awsStandardAccountID?.includes(query) ||
        e.awsAccountEmail?.toLowerCase().includes(lowerQuery)
      )
      .sort((a, b) => (a.projectName || '').localeCompare(b.projectName || ''))
      .slice(0, 25)
  }

  /**
   * Handle input change to detect @ mentions
   */
  function handleInputChange(value: string, cursorPosition: number): boolean {
    // Find the last @ before cursor
    const textBeforeCursor = value.substring(0, cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex === -1) {
      showMentionDropdown.value = false
      return false
    }

    // Check if @ is at start or preceded by whitespace
    const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' '
    const isValidMentionStart = charBeforeAt === ' ' || lastAtIndex === 0

    if (!isValidMentionStart) {
      showMentionDropdown.value = false
      return false
    }

    // Check if there's whitespace after @ (means mention was completed)
    const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1)
    if (textAfterAt.includes(' ')) {
      showMentionDropdown.value = false
      return false
    }

    // We have a valid mention in progress
    mentionQuery.value = textAfterAt
    mentionPosition.value = lastAtIndex
    filteredAccounts.value = searchAccounts(textAfterAt)
    selectedMentionIndex.value = 0
    // Always show dropdown when @ is typed (to show search hint or results)
    showMentionDropdown.value = true

    return true
  }

  /**
   * Select an account from the mention dropdown
   */
  function selectAccount(account: AWSEnclaveData, currentValue: string): string {
    selectedAccountForMessage.value = account

    // Replace @query with @AccountName
    const beforeMention = currentValue.substring(0, mentionPosition.value)
    const afterMention = currentValue.substring(mentionPosition.value + mentionQuery.value.length + 1)

    const accountDisplay = account.projectName || account.accountId
    const newValue = `${beforeMention}@${accountDisplay} ${afterMention}`

    showMentionDropdown.value = false
    mentionQuery.value = ''

    return newValue
  }

  /**
   * Navigate mention dropdown with keyboard
   */
  function navigateMentions(direction: 'up' | 'down') {
    if (!showMentionDropdown.value || filteredAccounts.value.length === 0) return

    if (direction === 'down') {
      selectedMentionIndex.value = Math.min(
        selectedMentionIndex.value + 1,
        filteredAccounts.value.length - 1
      )
    } else {
      selectedMentionIndex.value = Math.max(selectedMentionIndex.value - 1, 0)
    }
  }

  /**
   * Select the currently highlighted account
   */
  function selectHighlightedAccount(currentValue: string): string | null {
    if (!showMentionDropdown.value || filteredAccounts.value.length === 0) return null

    const account = filteredAccounts.value[selectedMentionIndex.value]
    return selectAccount(account, currentValue)
  }

  /**
   * Close the mention dropdown
   */
  function closeMentionDropdown() {
    showMentionDropdown.value = false
    mentionQuery.value = ''
    selectedMentionIndex.value = 0
  }

  /**
   * Clear selected account (call after message is sent)
   */
  function clearSelectedAccount() {
    selectedAccountForMessage.value = null
  }

  /**
   * Get account display name
   */
  function getAccountDisplay(account: AWSEnclaveData): string {
    return account.projectName || account.accountId
  }

  /**
   * Get account subtitle for dropdown
   */
  function getAccountSubtitle(account: AWSEnclaveData): string {
    const parts = []
    if (account.awsStandardAccountID) {
      parts.push(`Comm: ${account.awsStandardAccountID}`)
    }
    if (account.awsGovCloudAccountID) {
      parts.push(`Gov: ${account.awsGovCloudAccountID}`)
    }
    return parts.join(' | ') || account.accountId
  }

  /**
   * Set the selected mention index (for mouse hover)
   */
  function setMentionIndex(index: number) {
    selectedMentionIndex.value = index
  }

  return {
    // State (computed for reactivity)
    showMentionDropdown: computed(() => showMentionDropdown.value),
    filteredAccounts: computed(() => filteredAccounts.value),
    selectedAccountForMessage: computed(() => selectedAccountForMessage.value),
    selectedMentionIndex: computed(() => selectedMentionIndex.value),
    mentionQuery: computed(() => mentionQuery.value),

    // Methods
    handleInputChange,
    selectAccount,
    navigateMentions,
    selectHighlightedAccount,
    closeMentionDropdown,
    clearSelectedAccount,
    getAccountDisplay,
    getAccountSubtitle,
    setMentionIndex
  }
}
