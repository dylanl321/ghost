---
title: Managing Conversations in GHOST Chat
lastUpdated: 2025-12-05
icon: i-heroicons-folder
---

# Managing Conversations

GHOST Chat organizes your conversations into threads that persist across sessions. Learn how to create, organize, share, and export your chat history.

## Thread Basics

### What is a Thread?
A thread is a single conversation with the AI assistant. Each thread:
- Has its own conversation history
- Maintains context for follow-up questions
- Can be renamed, pinned, archived, or deleted
- Persists in your account until you delete it

### Creating Threads

**Automatic creation**: The first time you send a message, a new thread is created with the title "New Conversation"

**Manual creation**: Click the "New" button in the thread sidebar to start a fresh conversation

## Organizing Threads

### Thread Actions

Each thread has several management options:

**Rename**
- Click the thread title at the top of the chat
- Edit inline and press Enter to save
- Use descriptive names like "November Costs Analysis" or "EC2 Instance Investigation"

**Pin**
- Keeps important threads at the top of your sidebar
- Pinned threads show a pin icon
- Useful for ongoing investigations or frequently-referenced conversations

**Archive**
- Removes threads from your main view without deleting them
- Access archived threads using the filter dropdown
- Good for completed conversations you may need later

**Delete**
- Permanently removes the thread and all messages
- Confirmation required
- Cannot be undone

**Clear**
- Removes all messages but keeps the thread
- Useful for reusing a thread title with a fresh conversation

### Finding Threads

**Search Bar**
- Type in the search box at the top of the sidebar
- Searches thread titles only
- Real-time filtering as you type

**Filter Dropdown**
- **All threads**: Default view showing active conversations
- **Pinned only**: Show only pinned threads
- **Archived only**: View archived conversations

### Bulk Operations

Select multiple threads for batch actions:
1. Click the checkbox icon in the sidebar header
2. Check the threads you want to manage
3. Click "Delete Selected" to remove multiple threads at once

## Sharing Conversations

Share read-only conversation links with team members or stakeholders.

### Creating a Share Link

1. Click the "Share" button in the thread header (or in thread context menu)
2. The share modal displays two URLs:
   - **Full URL**: `https://ghost.example.com/chat/shared/abc123...`
   - **Short URL**: `https://ghost.example.com/s/abc123`
3. Click "Copy" buttons to copy either URL to clipboard

### Share Link Features

- **Public access**: No authentication required to view
- **Read-only**: Viewers cannot add messages or modify the thread
- **Expiration**: Links expire after 90 days by default
- **Full content**: All messages, metadata, and smart links are visible

### Managing Share Links

**View expiration**: The share modal shows when the link will expire

**Disable sharing**: Click "Remove Share" to immediately invalidate the link

**Reshare**: Creating a new share link generates a new URL and extends expiration

### When to Share

- Documenting cost analysis for stakeholders
- Sharing security finding summaries with your team
- Preserving investigation results for future reference
- Collaborating on resource planning decisions

## Exporting Conversations

Download conversation data for local storage, documentation, or processing.

### Export Formats

**JSON Export**
- Complete structured data with all metadata
- Includes message content, timestamps, account IDs, and tool calls
- Best for: Data processing, archival, programmatic access
- File size: ~500 bytes per message

**Markdown Export**
- Human-readable formatted text
- Preserves message formatting and structure
- Includes metadata badges and reference links
- Best for: Documentation, reports, sharing in other tools
- File size: ~300 bytes per message

### Exporting a Thread

1. Click "Export" button in the thread header
2. Choose your format (JSON or Markdown)
3. Review the estimated file size
4. Click "Download"

Files are named automatically: `ghost-chat-[thread-title]-[timestamp].[ext]`

Example: `ghost-chat-November-Costs-Analysis-2025-12-05.md`

### What's Included in Exports

- All messages in the thread (user and AI)
- Timestamps for each message
- Account context and metadata
- Smart link references
- Tool calls made by the AI (in JSON format)
- Suggested follow-up prompts (in JSON format)

## Thread Organization Best Practices

### Naming Conventions
Use descriptive thread names that identify:
- The account or accounts discussed
- The topic or investigation focus
- The time period (if relevant)

Examples:
- "Prod Account Nov 2025 Cost Spike Investigation"
- "Security Findings Review - Staging Environment"
- "EC2 Instance Optimization - Account 123456"

### When to Start a New Thread
- Switching to a different account or topic
- Starting a new time period analysis
- Beginning an unrelated investigation
- After a thread becomes long (30+ messages)

### When to Continue an Existing Thread
- Following up on previous findings
- Asking related questions about the same context
- Building on earlier analysis
- When the AI needs previous conversation context

### Pinning Strategy
Pin threads for:
- Active ongoing investigations
- Frequently-accessed information
- Monthly/weekly recurring checks
- Critical cost monitoring conversations

### Archiving Strategy
Archive threads when:
- Investigation is complete
- Information is no longer current
- You've documented findings elsewhere
- Thread is still useful for reference but not active

## Tips

**Keep threads focused**: One topic per thread makes them easier to find and share

**Clean up regularly**: Archive or delete old threads to keep your sidebar manageable

**Export important findings**: Download significant investigations before they get too old

**Use descriptive names**: Future you will thank present you for clear thread titles
