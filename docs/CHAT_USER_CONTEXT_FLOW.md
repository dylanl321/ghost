# Chat AI User Context Data Flow

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Sends Chat Message                  │
│                    "What are my costs this month?"               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              POST /api/strands/chat.post.ts                      │
│                                                                   │
│  1. Validate authentication (entra-auth middleware)              │
│  2. Parse request body (message, history, sessionId)             │
│  3. Build user context ──────────────────────┐                  │
└──────────────────────────────────────────────┼──────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────┐
│           buildUserContextForAI(event)                           │
│           server/utils/user-context-builder.ts                   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Step 1: Get User Info from Auth Session                  │   │
│  │  - userName: "John Doe"                                   │   │
│  │  - userEmail: "john.doe@gd-ms.com"                        │   │
│  │  - isAdmin: true/false                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                             │                                     │
│                             ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Step 2: Get User Preferences from DynamoDB               │   │
│  │  Table: ghost_user_preferences                            │   │
│  │  Key: { userId: "john.doe@gd-ms.com" }                   │   │
│  │                                                            │   │
│  │  Returns:                                                  │   │
│  │  - timezone: "America/New_York"                           │   │
│  │  - preferences.favoriteAccounts: [                        │   │
│  │      "123456789012",                                       │   │
│  │      "234567890123",                                       │   │
│  │      "345678901234"                                        │   │
│  │    ]                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                             │                                     │
│                             ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Step 3: Scan All Accounts from DynamoDB                  │   │
│  │  Table: ghost_external_accounts                           │   │
│  │  Operation: Scan (all items)                              │   │
│  │                                                            │   │
│  │  For each account:                                         │   │
│  │    - Check if accountId in favoriteAccounts               │   │
│  │    - Check if user matches admin fields:                  │   │
│  │      • primaryAccountAdminUsername                        │   │
│  │      • delegateAccountAdminUsername                       │   │
│  │      • costManagerUsername                                │   │
│  │                                                            │   │
│  │  Builds:                                                   │   │
│  │    favoriteAccounts: [                                     │   │
│  │      { accountId: "123...", accountName: "Project A" }    │   │
│  │    ]                                                       │   │
│  │    adminAccounts: [                                        │   │
│  │      { accountId: "456...", accountName: "Project B",     │   │
│  │        role: "primary" }                                   │   │
│  │    ]                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                             │                                     │
│                             ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Step 4: Return UserContextForAI Object                   │   │
│  │  {                                                         │   │
│  │    userName: "John Doe",                                  │   │
│  │    userEmail: "john.doe@gd-ms.com",                       │   │
│  │    isAdmin: true,                                         │   │
│  │    timezone: "America/New_York",                          │   │
│  │    favoriteAccounts: [...],                               │   │
│  │    adminAccounts: [...],                                  │   │
│  │    totalFavorites: 3,                                     │   │
│  │    totalAdminAccounts: 2                                  │   │
│  │  }                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│           formatUserContextForAI(context)                        │
│           server/utils/user-context-builder.ts                   │
│                                                                   │
│  Converts object to natural language markdown:                   │
│                                                                   │
│  ## Current User Context                                         │
│                                                                   │
│  **User:** John Doe (john.doe@gd-ms.com)                        │
│  **Timezone:** America/New_York                                  │
│  **Role:** GHOST Administrator                                   │
│                                                                   │
│  **Favorite Accounts (3):**                                      │
│  - Project Alpha (123456789012)                                  │
│  - Project Beta (234567890123)                                   │
│  - Project Gamma (345678901234)                                  │
│                                                                   │
│  **Accounts with Admin Access (2):**                             │
│  - Project Delta (456789012345) - Primary Admin                  │
│  - Project Epsilon (567890123456) - Delegate Admin               │
│                                                                   │
│  **Instructions for AI Assistant:**                              │
│  - Prioritize favorite accounts when user asks about "my costs"  │
│  - Use timezone for date references                              │
│  - User has elevated admin access                                │
└──────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              Construct Full Query for AI                         │
│              server/api/strands/chat.post.ts                     │
│                                                                   │
│  fullQuery = `                                                   │
│    ${userContextText}                                            │
│                                                                   │
│    Previous conversation:                                        │
│    User: How much did I spend last month?                        │
│    Assistant: Your favorite accounts spent $1,234 last month.    │
│                                                                   │
│    Current query: What are my costs this month?                  │
│  `                                                                │
└──────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              sendStrandsQuery(fullQuery, options)                │
│              server/utils/strands-client.ts                      │
│                                                                   │
│  POST to Strands ALB:                                            │
│  {                                                                │
│    "query": "<full query with user context>",                   │
│    "account_identifier": "123456789012",                         │
│    "session_id": "session-abc-123",                              │
│    "timezone": "America/New_York",                               │
│    "conversation_history": [...]                                 │
│  }                                                                │
└──────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Strands AI Agent                              │
│                    (ECS Service + MCP Servers)                   │
│                                                                   │
│  Receives full context including:                                │
│  ✅ User identity and timezone                                   │
│  ✅ Favorite accounts with names                                 │
│  ✅ Admin accounts with roles                                    │
│  ✅ Conversation history                                         │
│  ✅ AI instructions for personalization                          │
│                                                                   │
│  Processes query with MCP tools:                                 │
│  - Cost Explorer MCP                                             │
│  - AWS Config MCP                                                │
│  - Security Hub MCP                                              │
│                                                                   │
│  Generates personalized response:                                │
│  "Based on your favorite accounts (Project Alpha, Beta, Gamma),  │
│   your costs this month are $X. This is Y% higher than last      │
│   month. Would you like me to break this down by service?"       │
└──────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              Response Processing                                 │
│              server/api/strands/chat.post.ts                     │
│                                                                   │
│  1. Extract metadata (accountId, mcpUsed)                        │
│  2. Generate smart links (cost explorer, reports)                │
│  3. Extract follow-up prompts                                    │
│  4. Return to frontend                                           │
└──────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    User Sees Response                            │
│                                                                   │
│  "Based on your favorite accounts (Project Alpha, Beta, Gamma),  │
│   your costs this month are $1,456. This is 12% higher than      │
│   last month. Would you like me to break this down by service?"  │
│                                                                   │
│  [View Cost Explorer] [View Reports] [Compare to Last Month]     │
└─────────────────────────────────────────────────────────────────┘
```

## Key Data Points Sent to AI

| Data Point | Source | Example |
|------------|--------|---------|
| User Name | Auth Session | "John Doe" |
| User Email | Auth Session | "john.doe@gd-ms.com" |
| Is Admin | `isUserAdmin(event)` | true |
| Timezone | User Preferences DynamoDB | "America/New_York" |
| Favorite Account IDs | User Preferences DynamoDB | ["123...", "234..."] |
| Favorite Account Names | External Accounts DynamoDB | ["Project Alpha", "Project Beta"] |
| Admin Account IDs | External Accounts DynamoDB | ["456...", "567..."] |
| Admin Account Names | External Accounts DynamoDB | ["Project Delta", "Project Epsilon"] |
| Admin Roles | External Accounts DynamoDB | ["primary", "delegate"] |
| Conversation History | Request Body | Last 6 messages |

## Performance Characteristics

- **User Context Build Time**: ~100-300ms
  - Auth lookup: ~5ms (in-memory)
  - User preferences: ~20-50ms (DynamoDB GetItem)
  - Account scan: ~50-200ms (DynamoDB Scan)
  - Context formatting: ~5ms

- **Total Request Time**: ~2-30 seconds
  - User context: ~300ms
  - Strands query: ~2-30s (depends on MCP operations)
  - Response processing: ~100ms

- **Payload Size**:
  - User context: ~1-2KB
  - Conversation history: ~1-5KB
  - Total query: ~2-7KB

## Security Considerations

✅ **User can only see their own context**
- Auth middleware validates user identity
- Context builder uses authenticated user email
- No cross-user data leakage

✅ **Admin status is validated**
- `isUserAdmin()` checks Entra ID groups
- Not based on user-provided data

✅ **Account access is validated**
- Admin accounts matched against DynamoDB records
- Username matching is case-insensitive but exact

✅ **Sensitive data is not exposed**
- No credentials or secrets in context
- Only account IDs and names (already visible to user)
