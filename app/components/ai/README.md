# Ghost Chat UI - State Management Documentation

## Overview

The Ghost Chat UI is a sophisticated multi-threaded conversational AI interface with streaming responses, entity enrichment, and comprehensive thread management. This document provides clear rules for UI state management and troubleshooting guidance.

## Component Architecture

### Primary Components

- **GhostChatFullPage.vue** - Full-page chat interface with advanced features
- **StrandsChatPopup.vue** - Popup chat widget for floating chat
- **ChatMessage.vue** - Shared message rendering component used by both views
- **ThreadListSidebar.vue** - Full-featured thread management sidebar
- **ChatThreadsSidebar.vue** - Simple popup thread selector

### Supporting Composables

- **useStrandsChat.ts** - Core chat logic, SSE streaming, message management
- **useStrandsResponseEnricher.ts** - Entity detection and markdown processing
- **useChatThreadsStore.ts** - Pinia store for thread state management

## UI State Rules

### Welcome Message & Example Prompts

**Display Logic:**
```typescript
// Show welcome when:
// 1. Thread is empty (no messages)
// 2. Thread only has bot greeting (1 message, sender='bot')
showExamples.value = messages.length === 0 ||
                     (messages.length === 1 && messages[0].sender === 'bot')

// Hide welcome when:
// - User sends first message
// - Thread has more than 1 message
```

**Implementation:** `GhostChatFullPage.vue` (lines 289-315)

**State Reset:** Welcome state resets on thread change to show for new empty threads

### Thread Management

#### Creating New Thread
1. User clicks "New Thread" or "+" button
2. `threadsStore.createThread()` creates thread in DB
3. Thread added to `threads` list (front)
4. Set as `activeThreadId` and `currentThread`
5. Welcome message appears in UI
6. No page refresh - instant state update

#### Switching Threads
1. User clicks thread in sidebar
2. `threadsStore.loadThread(threadId)` fetches from DB
3. `isLoadingThread` flag set to block watch handlers
4. Messages replaced with thread's messages
5. `activeThreadId` and `currentThread` updated
6. Flag cleared, watches resume
7. Welcome shown if thread is empty

**Critical:** `isLoadingThread` flag prevents race conditions between watch handlers

#### Deleting Thread
1. User clicks delete on thread
2. `threadsStore.deleteThreadAndCreateNew(threadId)` called
3. Thread deleted from DB and `threads` list
4. New empty thread automatically created
5. New thread set as active
6. Welcome message appears
7. Toast notification: "Thread deleted - New conversation started"

**Rationale:** User always has an active thread context

### Streaming Responses

#### Streaming Lifecycle
```
User sends message
    ↓
Create streaming message placeholder
    → streamingMessages.set(messageId, {...})
    → activeStreams.add(messageId)
    → activeStreamCount++
    ↓
SSE stream starts
    ↓
[status events] → Update status indicator
[tool_call events] → Add to toolsCalled array
[response events] → Append content delta
    ↓
[complete event]
    → Save message to DB
    → streamingMessages.delete(messageId)
    → activeStreams.delete(messageId)
    → activeStreamCount--
```

#### Streaming Indicators

**"GHOST is thinking" appears when:**
- `activeStreamCount > 0`
- Any message has `status.status === 'pending' || 'streaming'`

**Cleanup triggers:**
- Message completion event
- Thread switch (cleans up lingering messages for that thread)
- Error/timeout

**Implementation:** `useChatThreadsStore.ts` (loadThread: lines 199-219, completeStreamingMessage: lines 695-699)

### Message Rendering

#### Rendering Pipeline
All messages go through the same pipeline for consistency:

```
Raw Content (markdown + entities)
    ↓
formatMessage(content)
    ↓
enrichStrandsResponse(content)
    ↓
1. Detect markdown link URLs: [text](url)
2. Exclude URLs from entity detection
3. Detect entities (account IDs, usernames, etc.)
4. Replace entities with placeholders (___ENTITY_0___)
5. Parse markdown → HTML
6. Replace placeholders with enriched entity HTML
    ↓
Rendered HTML (with interactive links)
```

**Key Fix:** Entities inside markdown link URLs are NOT enriched to prevent nested `<a>` tags

**Implementation:**
- `GhostChatFullPage.vue` formatMessage (lines 489-503)
- `useStrandsResponseEnricher.ts` (lines 232-308, 421-495)

**Error Handling:** If enrichment fails, content is HTML-escaped with line breaks

## State Flags

### isSendingMessage
- **Type:** `ref<boolean>`
- **Purpose:** Block watch handlers while sending message
- **Set true:** Before message send
- **Set false:** After message send completes
- **Blocks:** Thread watch, message watch

### isLoadingThread
- **Type:** `ref<boolean>`
- **Purpose:** Block watch handlers while loading thread
- **Set true:** Before thread operations (switch, load)
- **Set false:** After thread operations complete (in finally block)
- **Blocks:** Thread watch, message watch

### activeStreamCount
- **Type:** `ref<number>`
- **Purpose:** Track number of active streaming queries
- **Increment:** When streaming starts
- **Decrement:** When streaming completes/errors
- **Used by:** Footer indicator, status badges
- **Cleanup:** On thread switch (removes lingering streams)

## Entity Enrichment

### Supported Entity Types

| Type | Pattern | Example | Link |
|------|---------|---------|------|
| Account ID | 12 digits | `194263318138` | `/account/{id}` |
| Username | `user:name` or email | `user:john.doe` | `/account/user/{slug}` |
| Instance ID | `i-xxxxxxxxx` | `i-0a1b2c3d4e5f` | `/resources?instance={id}` |
| S3 Bucket | `s3://bucket` | `s3://my-bucket` | N/A |
| Lambda | `function:name` | `function:myFunc` | N/A |
| Security Group | `sg-xxxxxxxxx` | `sg-0a1b2c3d` | N/A |
| VPC | `vpc-xxxxxxxxx` | `vpc-0a1b2c3d` | N/A |
| RDS | `db:name` | `db:mydb` | N/A |

### Entity Exclusions

**Markdown Link URLs are excluded** - Prevents nested anchor tags:
```markdown
❌ [View Account](https://ghost.com/account/194263318138)
   └── Account ID 194263318138 is NOT enriched (it's in URL)

✅ Account 194263318138 has high costs
   └── Account ID 194263318138 IS enriched (it's in text)
```

**Implementation:** `getMarkdownLinkUrlRanges()` (lines 236-255)

## Common Issues & Solutions

### Issue: Welcome message doesn't appear on new thread
**Cause:** Thread has stale messages or state not reset

**Solution:** Check these conditions in order:
1. Is `messages.length === 0`? If not, thread has messages
2. Is `currentThreadId` being tracked? Check watch handler
3. Is thread switch triggering? Add console.log to watch

**Fix applied:** Lines 293-315 in GhostChatFullPage.vue track thread ID changes

### Issue: "GHOST is thinking" indicator stuck
**Cause:** `activeStreamCount` not decremented on completion

**Solution:**
1. Check `completeStreamingMessage` was called
2. Verify no JavaScript errors interrupted cleanup
3. Switch threads (triggers cleanup)

**Fix applied:** Lines 199-219 in useChatThreadsStore.ts clean up on thread load

### Issue: Raw HTML in messages (e.g., `data-nuxt-link class="..."`)
**Cause:** Entities inside markdown link URLs create nested `<a>` tags

**Solution:** Exclude markdown link URLs from entity detection

**Fix applied:** Lines 280, 291-292 in useStrandsResponseEnricher.ts skip URLs

### Issue: Messages from old thread briefly flash when switching
**Cause:** Watch handlers racing during thread switch

**Solution:** Use `isLoadingThread` flag to block watches

**Fix applied:** Lines 99, 120, 130-153, 166 in useStrandsChat.ts implement flag

### Issue: Thread deletion leaves no active thread
**Cause:** Using `deleteThread()` instead of `deleteThreadAndCreateNew()`

**Solution:** Use combined action that auto-creates new thread

**Fix applied:** Lines 431-453 in useChatThreadsStore.ts, lines 501-502 in ThreadListSidebar.vue

## Data Flow Diagrams

### Thread Switch Flow
```
User clicks thread
    ↓
handleThreadSelected(threadId)
    ↓
isLoadingThread = true (blocks watches)
    ↓
threadsStore.loadThread(threadId)
    ├── Clean up lingering streaming state
    ├── Fetch thread from DB
    ├── Preserve active streaming messages
    └── Merge DB + streaming messages
    ↓
Update activeThreadId & currentThread
    ↓
Watch triggers in GhostChatFullPage
    ├── currentThreadId !== newThreadId?
    ├── Reset showExamples based on messages
    └── Load messages into UI
    ↓
isLoadingThread = false (resume watches)
```

### Message Send Flow
```
User submits message
    ↓
isSendingMessage = true (blocks watches)
    ↓
Add user message to UI immediately
    ↓
Save user message to DB
    ↓
Create streaming message placeholder
    ├── streamingMessages.set(messageId, {...})
    ├── activeStreams.add(messageId)
    └── activeStreamCount++
    ↓
SSE stream to Strands API
    ├── [status] → Update status indicator
    ├── [tool_call] → Add to toolsCalled
    ├── [response] → Append content delta
    └── [complete] → Save to DB, cleanup streaming
    ↓
isSendingMessage = false (resume watches)
```

### Entity Enrichment Flow
```
Raw markdown content
    ↓
getMarkdownLinkUrlRanges()
    → Find all [text](url) patterns
    → Extract URL character ranges
    ↓
detectEntities(content)
    → Match regex patterns (account IDs, etc.)
    → Skip matches inside URL ranges
    → Return valid entity list
    ↓
Replace entities with placeholders
    → ___ENTITY_0___, ___ENTITY_1___, ...
    ↓
marked.parse(contentWithPlaceholders)
    → Convert markdown to HTML
    → Preserve placeholders
    ↓
Replace placeholders with enriched HTML
    → <a href="/account/{id}" data-entity-type="account-id">...</a>
    ↓
Return enriched HTML
```

## Testing Checklist

### Entity Links
- [ ] Markdown link with account ID in URL renders as clickable link (no raw HTML)
- [ ] Account ID in link text is enriched with popover
- [ ] Account ID in bullet list is enriched correctly
- [ ] Entity popover shows on hover/click

### Welcome Message
- [ ] New thread shows welcome + examples
- [ ] Sending first message hides welcome
- [ ] Switching to thread with messages: no welcome
- [ ] Switching to empty thread: welcome reappears

### Thread Management
- [ ] Create thread: instant, no page refresh
- [ ] Switch thread: instant load, no flashing
- [ ] Delete thread: auto-creates new thread with welcome
- [ ] Bulk delete: handles properly

### Streaming
- [ ] "GHOST is thinking" appears during query
- [ ] Indicator disappears on completion
- [ ] Switch threads during stream: no stuck indicators
- [ ] Multiple concurrent streams: count accurate

### General
- [ ] No full page refreshes during any operation
- [ ] No JavaScript errors in console
- [ ] Thread state persists on page refresh (activeThreadId)
- [ ] Messages render consistently (streaming vs DB)

## Performance Considerations

### Watch Debouncing
Message watch uses 100ms debounce to prevent rapid updates during streaming:
```typescript
syncTimeoutId = setTimeout(() => {
  // Sync messages
}, 100)
```

### Scroll Debouncing
Auto-scroll uses 50ms debounce to prevent multiple rapid scrolls:
```typescript
scrollTimeoutId = setTimeout(() => {
  scrollToBottom()
}, 50)
```

### State Cleanup
Streaming state cleanup happens:
1. On message completion (immediate)
2. On thread switch (before DB load)
3. On error/timeout (in error handler)

This ensures `activeStreamCount` stays accurate and no memory leaks occur.

## Architecture Decisions

### Why placeholders for entity enrichment?
**Reason:** Prevents markdown parser from mangling entity syntax (e.g., bold around account IDs breaking regex)

**Trade-off:** More complex processing, but more reliable results

### Why separate streaming state?
**Reason:** Vue reactivity struggles with rapid updates during SSE streaming (100+ updates/second)

**Trade-off:** Must merge streaming + DB messages on every reload

### Why isLoadingThread flag?
**Reason:** Multiple watch handlers can conflict during thread switches (race conditions)

**Trade-off:** Adds complexity, but prevents UI glitches and data corruption

### Why auto-create on delete?
**Reason:** User should always have an active conversation context ready to use

**Trade-off:** Creates "phantom" threads if user rapidly deletes, but better UX

## Debugging Tips

### Enable detailed logging
Add to browser console:
```javascript
localStorage.setItem('debug', 'chat:*')
```

### Check streaming state
In Vue DevTools:
```javascript
$store.useChatThreadsStore.streamingMessages
$store.useChatThreadsStore.activeStreamCount
```

### Check thread state
```javascript
$store.useChatThreadsStore.activeThreadId
$store.useChatThreadsStore.currentThread
$store.useChatThreadsStore.threads
```

### Monitor flags
```javascript
isSendingMessage.value
isLoadingThread.value
```

## Future Improvements

1. **Optimistic Updates** - Show messages immediately before DB save completes
2. **Message Caching** - Cache rendered HTML to avoid re-enriching on every render
3. **Virtual Scrolling** - For threads with 100+ messages
4. **WebSocket Fallback** - If SSE fails, fallback to WebSocket streaming
5. **Thread Search** - Full-text search across all thread messages
6. **Thread Categories** - User-defined tags/folders for organization
7. **Export Formats** - PDF, Markdown, JSON export options

---

**Last Updated:** 2025-12-06
**Authors:** Claude Code, GHOST Team
**Version:** 1.0
