/**
 * Parse AI Response Utility
 * 
 * Separates AI "thinking" text from the actual response.
 * The thinking text is everything before the first heading (# or ##).
 */

export interface ParsedAIResponse {
  /** The main response content (from first heading onward) */
  content: string
  /** AI's thinking/reasoning text (before first heading), if any */
  thinking: string | null
  /** Whether the response had thinking text that was extracted */
  hasThinking: boolean
}

/**
 * Parse an AI response to separate thinking from content
 * 
 * @param response - The raw AI response text
 * @returns Parsed response with separated thinking and content
 */
export function parseAIResponse(response: string): ParsedAIResponse {
  if (!response || typeof response !== 'string') {
    return {
      content: response || '',
      thinking: null,
      hasThinking: false
    }
  }

  // Find the first markdown heading (# or ##)
  // Match lines that start with # followed by space (not code blocks with ###)
  const headingRegex = /^(#{1,3})\s+.+$/m
  const match = response.match(headingRegex)

  if (!match || match.index === undefined) {
    // No heading found - return as-is (might be a simple response)
    return {
      content: response,
      thinking: null,
      hasThinking: false
    }
  }

  const headingIndex = match.index
  
  // If heading is at the start (within first 10 chars), no thinking text
  if (headingIndex < 10) {
    return {
      content: response,
      thinking: null,
      hasThinking: false
    }
  }

  // Extract thinking text (before the heading)
  const thinkingText = response.substring(0, headingIndex).trim()
  const mainContent = response.substring(headingIndex).trim()

  // Only consider it "thinking" if it's substantial (more than 50 chars)
  // and the main content exists
  if (thinkingText.length > 50 && mainContent.length > 0) {
    return {
      content: mainContent,
      thinking: thinkingText,
      hasThinking: true
    }
  }

  // Not enough thinking text or no main content - return as-is
  return {
    content: response,
    thinking: null,
    hasThinking: false
  }
}

/**
 * Format thinking text for display
 * Cleans up and summarizes the AI's reasoning
 */
export function formatThinkingText(thinking: string): string {
  if (!thinking) return ''
  
  // Clean up the thinking text
  let formatted = thinking
    // Remove common prefixes
    .replace(/^(I'll|Let me|I will|I need to|I'm going to|I am going to)\s+/gi, '')
    // Trim whitespace
    .trim()
  
  // Capitalize first letter
  if (formatted.length > 0) {
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1)
  }
  
  return formatted
}

/**
 * Get a short summary of thinking text (for tooltips)
 */
export function getThinkingSummary(thinking: string, maxLength: number = 150): string {
  if (!thinking) return ''
  
  const formatted = formatThinkingText(thinking)
  
  if (formatted.length <= maxLength) {
    return formatted
  }
  
  // Truncate at word boundary
  const truncated = formatted.substring(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')
  
  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace) + '...'
  }
  
  return truncated + '...'
}

