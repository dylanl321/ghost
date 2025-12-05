---
title: Getting Started with GHOST Chat
lastUpdated: 2025-12-05
icon: i-heroicons-chat-bubble-left-right
---

# Getting Started with GHOST Chat

GHOST Chat is an AI assistant that helps you query and analyze your AWS environment through natural conversation.

## What GHOST Chat Can Do

- **Cost Analysis**: Query spending, forecasts, and trends across accounts
- **Resource Discovery**: Find and list AWS resources (EC2, S3, Lambda, etc.)
- **Security Insights**: Check security findings and compliance status
- **Configuration Lookup**: Get details about specific resources
- **Contextual Guidance**: Get help navigating GHOST features

## How to Access

### Primary Access: Full Chat Page
Navigate to `/chat` from the sidebar menu (look for "AI Assistant" or chat icon).

The full-page interface includes:
- **Left sidebar**: Your conversation history and thread management
- **Center area**: Message conversation with the AI
- **Bottom input**: Text box for your questions

### Alternative: Corner Widget
On other GHOST pages, you'll find a chat widget in the bottom-right corner that can expand to fullscreen.

## Your First Conversation

### Starting a Chat
1. Navigate to `/chat`
2. Type your question in the input box at the bottom
3. Press Enter or click Send

A new conversation thread is created automatically on your first message.

### Example Questions

Try questions like:
- `What were my costs for account 123456789012 last month?`
- `Show me EC2 instances in the monitoring account`
- `What security findings does account XYZ have?`
- `Break down costs by service for this week`

The chat interface includes personalized example questions based on your favorite accounts when you first open it.

## Understanding Responses

### AI Messages
AI responses appear on the left side with:
- **Markdown formatting**: Headers, lists, code blocks, tables
- **Metadata badges**: Show which account was queried and what AWS APIs were called
- **Smart links**: Clickable cards that navigate you to relevant GHOST pages with pre-filled filters

### Response Times
**First query for an account**: 2-4 minutes
- GHOST Chat connects to AWS MCP (Model Context Protocol) servers
- New accounts require temporary server initialization
- Subsequent queries to the same account are much faster

**Common accounts**: Nearly instant
- Frequently-used accounts have permanent MCP servers ready
- Examples: Master accounts, monitoring accounts

**Status updates**: During processing, you'll see progress messages like "Resolving account..." and "Calling AWS Cost Explorer API..."

### Smart Links
Below AI responses, you'll see icon-based link cards that take you directly to relevant GHOST pages:
- **Cost Dashboard**: Pre-filled with account, dates, and services from your query
- **Account Explorer**: Jump to resource browsing for the account
- **Organization Chart**: View the account in your org structure
- **Security Findings**: Check compliance and security data

Click any link to navigate with all relevant filters already applied.

### Suggested Follow-Up Questions
The AI may suggest next questions as clickable chips below its response:
- Questions for deeper analysis
- Actions you can take
- Clarifications for ambiguous queries

Click any suggestion to automatically send that question.

## Context and Memory

Each conversation thread maintains its own context:
- **Conversation history**: Your last 6 messages are sent with each new query
- **Account context**: The AI remembers which account you're discussing
- **Follow-up queries**: You can ask follow-up questions without repeating details

Example:
```
You: What were costs for account 123456789012 in November?
AI: [responds with November costs]
You: How about December?
AI: [understands you mean the same account]
```

## Technical Note: MCP Servers

GHOST Chat uses AWS Model Context Protocol (MCP) servers to execute AWS API calls on your behalf.

**Permanent MCP Servers**: Pre-configured for frequently-used accounts
- Gov Master (374673712317)
- Monitoring Account (083876038518)
- Commercial Master (205950196477)
- Response time: Nearly instant

**Temporary MCP Servers**: Created on-demand for other accounts
- Initial query: 2-4 minutes (server initialization)
- Subsequent queries: Normal speed
- Servers remain available for ongoing conversation

This architecture ensures both broad account coverage and fast performance for common queries.

## Tips for Effective Queries

- **Be specific with account identifiers**: Use full 12-digit account IDs when possible
- **Include time ranges**: "last month", "this week", "December 2025"
- **Ask follow-up questions**: Build on previous responses for deeper analysis
- **Use natural language**: No special syntax required, just ask naturally

## Next Steps

- Learn about [thread management and sharing](/support/docs?topic=managing-conversations)
- Explore [advanced features](/support/docs?topic=advanced-features)
