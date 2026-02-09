# AI Chat System - Review Notes

## Scope

The AI chat feature provides a full-page conversational interface backed by an AWS Strands agent. It includes thread management, streaming responses, entity enrichment, export capabilities, and admin monitoring.

## Files to Review

### Pages
| File | Lines | Role |
|------|-------|------|
| `app/pages/chat.vue` | 360 | Full-page chat interface |
| `app/pages/chat/shared/[shareId].vue` | 333 | Shared/read-only chat view |

### Components (in `app/components/ai/`)
| File | Lines | Role |
|------|-------|------|
| `GhostChatFullPage.vue` | 1,029 | Main chat UI with message list and composer |
| `ChatExportModal.vue` | 799 | Export chat threads to PDF/markdown |
| `StrandsChatPopup.vue` | 664 | Floating popup chat widget |
| `AccountDisambiguationModal.vue` | 160 | Account selection during chat |

### Composables
| File | Lines | Role |
|------|-------|------|
| `useChatUI.ts` | 1,540 | Chat UI state management (thread list, messages, streaming) |
| `useStrandsResponseEnricher.ts` | 659 | Enriches agent responses with entity links and formatting |
| `useChatSidebar.ts` | 70 | Sidebar toggle state |

### Admin Components
| File | Lines | Role |
|------|-------|------|
| `admin/AIChatMonitorPanel.vue` | 871 | Admin monitoring of chat sessions |

## Known Concerns

### Critical Size Issues
- `useChatUI.ts` at 1,540 lines manages thread CRUD, message streaming, WebSocket state, error handling, retry logic, and UI state all in one composable.
- `GhostChatFullPage.vue` at 1,029 lines handles message rendering, auto-scroll, typing indicators, tool call displays, and thread switching.

### Likely Problems to Investigate
- **Streaming state machine complexity** - SSE/WebSocket handling with reconnection and error recovery
- **Memory leaks** - are event listeners and streams properly cleaned up on unmount?
- **Message rendering performance** - large threads with markdown rendering could be slow
- **Entity enrichment** - the enricher at 659 lines suggests complex parsing that could have edge cases
- **Export reliability** - PDF generation from chat threads is notoriously fragile
- **Admin monitoring** - real-time session monitoring may have stale data issues
- **Duplicate chat UI** - GhostChatFullPage vs StrandsChatPopup likely share significant logic
