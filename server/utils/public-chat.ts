import type { ChatMessage } from '#shared/types/chat-threads'

export type PublicChatMessage = Pick<ChatMessage, 'messageId' | 'role' | 'content' | 'timestamp' | 'links' | 'suggestedLinks' | 'suggestedPrompts'>

export function serializePublicChatMessage(message: ChatMessage): PublicChatMessage {
  return {
    messageId: message.messageId,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    ...(message.links ? { links: message.links } : {}),
    ...(message.suggestedLinks ? { suggestedLinks: message.suggestedLinks } : {}),
    ...(message.suggestedPrompts ? { suggestedPrompts: message.suggestedPrompts } : {})
  }
}
