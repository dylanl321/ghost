---
title: Advanced Features & Troubleshooting
lastUpdated: 2025-12-05
icon: i-heroicons-wrench-screwdriver
---

# Advanced Features & Troubleshooting

Take full advantage of GHOST Chat's capabilities and resolve common issues.

## Account Targeting with @-Mentions

Explicitly specify which AWS account you want to query using @-mentions, similar to mentioning users in chat apps.

### Using @-Mentions

1. Type `@` in the message input box
2. A dropdown appears showing your accounts
3. Start typing to filter by account name, project, or ID
4. Select the account from the list
5. The account appears as a chip at the bottom of the input
6. Type your question and send

### Benefits of @-Mentions

- **Precision**: Removes ambiguity about which account to query
- **Speed**: Faster account resolution (no interpretation needed)
- **Multiple accounts**: Some queries work across accounts by mentioning multiple accounts
- **Context indicator**: Visual confirmation of which account will be used

### Example
```
@Production WebApp Account
What were my EC2 costs last week?
```

The account chip shows at the bottom: `Account: Production WebApp (123456789012)`

### When to Use @-Mentions

- When account names are ambiguous ("prod", "production", "prod app")
- For accounts you don't frequently query
- When precision is critical (security or cost investigations)
- To override the AI's account inference

## Account Disambiguation

When your query matches multiple accounts, GHOST Chat presents a disambiguation modal.

### How It Works

1. You ask a question with an ambiguous account reference
2. The AI identifies multiple matching accounts
3. A modal appears showing the matches
4. Each option displays:
   - Account alias/name
   - Account ID(s) (both Commercial and GovCloud if applicable)
   - Match score and reason (e.g., "Name contains 'prod'")
5. You select the correct account
6. The query automatically re-executes with your selection

### Example Scenario

Query: `Show me costs for the monitoring account`

If you have multiple accounts with "monitoring" in the name:
- "Monitoring - Production"
- "Monitoring - Staging"
- "Dev Monitoring Tools"

The disambiguation modal lets you choose the specific one you meant.

### Avoiding Disambiguation

- Use full 12-digit account IDs: `123456789012`
- Use complete account names: `Monitoring - Production`
- Use @-mentions for explicit targeting
- Reference accounts by unique attributes

## Smart Links to GHOST Pages

GHOST Chat automatically generates navigation links based on your conversation context.

### How Smart Links Work

After the AI responds, the system analyzes:
- Which account(s) were discussed
- What time period was mentioned
- What AWS services were queried
- What type of data was retrieved

It then generates clickable link cards that navigate you to the appropriate GHOST page with filters pre-applied.

### Available Smart Link Types

**Cost Dashboard**
- Pre-filled with account, date range, services, and grouping
- Opens to the exact view discussed in the chat
- Example: Account 123456789012, December 2025, grouped by service

**Account Explorer**
- Navigates to resource browsing for the account
- Shows EC2, S3, Lambda, and other AWS resources
- Filtered to the mentioned account

**Organization Chart**
- Opens the org chart view
- Highlights the specific account in your organizational structure
- Useful for understanding account relationships

**Security Findings**
- Links to compliance and security data
- Filtered to the account discussed
- Quick access to Security Hub findings

**Dataset Reports**
- Access detailed reports mentioned in the conversation
- Pre-filtered to relevant parameters

### Using Smart Links

1. Look for icon-based cards below AI messages
2. Hover to see the card highlight
3. Click to navigate with all filters applied
4. Use your browser's back button to return to chat

Smart links save time by eliminating manual filter selection and navigation.

## Suggested Follow-Up Prompts

The AI may suggest next questions as clickable chips below its responses.

### Prompt Types

**Question prompts**: Dig deeper into the data
- "Break down by service"
- "Show me the top 5 resources"
- "What about last month?"

**Action prompts**: Take next steps
- "Export this to CSV"
- "Show me the resource details"
- "Compare to previous month"

**Clarification prompts**: Refine your query
- "Did you mean Account A or Account B?"
- "Which time period exactly?"
- "Which region?"

### Using Suggested Prompts

Simply click any suggestion to send it as your next message. The AI maintains context from your previous conversation.

## Understanding Response Metadata

Each AI response includes badges showing technical details:

### Account Badge
Shows which AWS account was queried:
- `Account: 123456789012`
- Confirms the AI interpreted your request correctly

### MCP Server Badge
Indicates the server type used:
- `Permanent MCP`: Fast, pre-configured server
- `Temporary MCP`: On-demand server (first query is slower)

### Tool Call Badges
Shows which AWS APIs were invoked:
- `get_cost_and_usage`: Cost Explorer API
- `list_ec2_instances`: EC2 API
- `get_security_findings`: Security Hub API

These badges help you understand:
- Which account was actually queried
- Why a response took longer (temporary MCP initialization)
- What AWS operations were performed

## Tips for Effective Queries

### Be Specific with Time Periods
- ✅ "Last 30 days", "December 2025", "This billing month"
- ❌ "Recently", "A while ago"

### Use Complete Account Identifiers
- ✅ "Account 123456789012", "Production WebApp Account"
- ❌ "Prod", "That account we discussed"

### Build on Context
Continue conversations for follow-up questions instead of starting fresh threads:
```
You: What were November costs for account 123456789012?
AI: [provides November costs]
You: Break that down by service
AI: [provides service breakdown]
You: Show me the top 5
AI: [shows top 5 services]
```

### Ask Direct Questions
- ✅ "What were my EC2 costs in November for account X?"
- ❌ "I was wondering if you could possibly help me understand what happened with costs..."

### Specify Data Preferences
- "Show me daily costs" vs. monthly aggregates
- "Top 10 resources" vs. all resources
- "Group by service" vs. grouped by operation

## Troubleshooting

### Long Wait Times (2-4 minutes)

**Cause**: First query for an account requires temporary MCP server initialization

**Solution**:
- Wait for initialization to complete
- Subsequent queries to the same account will be faster
- Consider using @-mentions with frequently-used accounts

**Status**: The chat shows "Initializing MCP server..." during this process

### "Account Not Found" Errors

**Cause**: Account identifier doesn't match any accounts you have access to

**Solutions**:
- Verify the account ID is correct (12 digits)
- Check you have permission to access the account
- Use the full account name or ID instead of abbreviations
- Try using @-mentions to select from your available accounts

### "Service Unavailable" Errors

**Cause**: Backend MCP service or AWS API is temporarily unavailable

**Solutions**:
- Wait a moment and retry your query
- Check if specific AWS services are experiencing outages
- Try a different account to determine if it's account-specific

### Request Timeout Errors

**Cause**: Query took longer than 5 minutes to complete

**Solutions**:
- Break complex queries into smaller parts
- Narrow the time range for cost queries
- Specify fewer resources or accounts
- Try the query again (MCP server may now be initialized)

### Ambiguous Results

**Cause**: Your query wasn't specific enough or matches multiple resources

**Solutions**:
- Use exact account IDs instead of names
- Specify date ranges explicitly
- Use @-mentions for account targeting
- Provide more context in your question

### Conversation Lost Context

**Cause**: Thread history is too long, or you switched to a different thread

**Solutions**:
- Start a new thread for unrelated topics
- Re-state your context in the new message
- Reference specific details (account ID, dates) in each query
- Use @-mentions to maintain account context

### Unexpected Account Selected

**Cause**: AI inferred the wrong account from your query

**Solutions**:
- Use @-mentions to explicitly select the account
- Include the full 12-digit account ID in your query
- Check the account badge in the response to verify
- Use account disambiguation when prompted

## Performance Tips

**For faster responses:**
- Query accounts with permanent MCP servers (check with your admin)
- Keep time ranges reasonable (days/weeks vs. years)
- Use the same thread for related queries (maintains context)
- Be specific with account identifiers to skip disambiguation

**For better results:**
- Provide context in your initial question
- Use follow-up questions to refine results
- Specify the granularity you want (daily, monthly, etc.)
- Ask one question at a time for complex investigations

## Privacy and Data

**What's stored:**
- Your conversation threads and messages
- Account IDs mentioned in conversations
- Thread metadata (creation date, title, etc.)

**What's not stored:**
- Raw AWS API responses (only summaries shown in chat)
- Your AWS credentials (role assumption handles access)
- Temporary MCP server data (cleared after session)

**Sharing considerations:**
- Share links are public but expire after 90 days
- Exported data is downloaded to your local machine
- Only share conversations that don't contain sensitive information

## Getting Help

If you encounter persistent issues:
1. Try the query in a new thread
2. Check your account permissions in GHOST
3. Verify the account ID is correct
4. Contact your GHOST administrator
5. Export the conversation for error reporting

For questions about AWS costs or resources that GHOST Chat cannot answer, consider using the Cost Dashboard or Account Explorer directly for detailed analysis.
