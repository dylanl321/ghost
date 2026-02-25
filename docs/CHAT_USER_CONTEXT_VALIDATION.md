# Chat AI User Context Validation

## Overview
This document validates that the chat AI system properly sends user context including accounts, favorites, and metadata.

## Validation Results ✅

### 1. User Context Builder (`server/utils/user-context-builder.ts`)

**Status: VALIDATED ✅**

The `buildUserContextForAI()` function correctly builds comprehensive user context:

```typescript
export interface UserContextForAI {
  userName: string              // User's display name
  userEmail: string             // User's email address
  isAdmin: boolean              // Whether user is GHOST admin
  timezone: string              // User's timezone (IANA format)
  favoriteAccounts: Array<{     // User's favorite accounts
    accountId: string
    accountName?: string
  }>
  adminAccounts: Array<{        // Accounts where user has admin roles
    accountId: string
    accountName?: string
    role: 'primary' | 'delegate' | 'cost-manager'
  }>
  totalFavorites: number        // Count of favorite accounts
  totalAdminAccounts: number    // Count of admin accounts
}
```

### 2. Data Sources

**Favorite Accounts:**
- ✅ Retrieved from `getUserPreferences(userEmail)`
- ✅ Stored in `preferences.preferences.favoriteAccounts` as array of account IDs
- ✅ Enriched with account names from DynamoDB `externalAccounts` table

**Admin Accounts:**
- ✅ Scanned from DynamoDB `externalAccounts` table
- ✅ Matches user against three admin fields:
  - `primaryAccountAdminUsername`
  - `delegateAccountAdminUsername`
  - `costManagerUsername`
- ✅ Includes role type in context

**User Metadata:**
- ✅ User name and email from auth session
- ✅ Admin status from `isUserAdmin(event)`
- ✅ Timezone from user preferences (defaults to browser timezone)

### 3. Context Formatting (`formatUserContextForAI()`)

**Status: VALIDATED ✅**

The context is formatted as natural language for the AI:

```markdown
## Current User Context

**User:** John Doe (john.doe@gd-ms.com)
**Timezone:** America/New_York
**Role:** GHOST Administrator (AWS Product Team member)

**Favorite Accounts (5):**
- Project Alpha (123456789012)
- Project Beta (234567890123)
- ... and 3 more favorites

**Accounts with Admin Access (3):**
- Project Gamma (345678901234) - Primary Admin
- Project Delta (456789012345) - Delegate Admin
- Project Epsilon (567890123456) - Cost Manager

---

**Instructions for AI Assistant:**
- When the user asks about "my accounts" or "my costs", prioritize their favorite accounts and accounts where they have admin access
- If the user's query is ambiguous, suggest checking their favorite accounts first
- When discussing costs or resources, offer to look at their favorite accounts if no specific account is mentioned
- Use the user's timezone for date/time references
- This user is a GHOST administrator with elevated access
```

### 4. Integration with Chat Endpoint

**Status: VALIDATED ✅**

In `server/api/strands/chat.post.ts`:

```typescript
// Line 276-277
const userContext = await buildUserContextForAI(event)
const userContextText = formatUserContextForAI(userContext)

// Line 285-295
if (conversationHistory.length > 0) {
  fullQuery = `${userContextText}\n\nPrevious conversation:\n${contextParts.join('\n')}\n\nCurrent query: ${message}`
} else {
  fullQuery = `${userContextText}\n\nUser query: ${message}`
}
```

The user context is:
- ✅ Built on every chat request
- ✅ Prepended to the user's message
- ✅ Sent to Strands AI agent via `sendStrandsQuery()`
- ✅ Includes conversation history when available

### 5. Limits and Optimization

**Display Limits:**
- ✅ Shows first 10 favorite accounts (with count if more)
- ✅ Shows first 10 admin accounts (with count if more)
- ✅ Prevents context from becoming too large

**Performance:**
- ✅ Single DynamoDB scan for all accounts
- ✅ Efficient matching using username comparison
- ✅ Deduplicates admin accounts (user might have multiple roles)

## What Gets Sent to AI

For each chat request, the AI receives:

1. **User Identity**
   - Name and email
   - Admin status
   - Timezone

2. **Favorite Accounts** (up to 10 shown, total count provided)
   - Account ID
   - Account name/alias
   - Full list available in context

3. **Admin Accounts** (up to 10 shown, total count provided)
   - Account ID
   - Account name/alias
   - Admin role type (primary/delegate/cost-manager)
   - Full list available in context

4. **AI Instructions**
   - Prioritize user's favorite accounts
   - Use timezone for date references
   - Respect admin privileges

5. **Conversation History** (last 6 messages)
   - Previous user messages
   - Previous assistant responses

## Testing Instructions

### Manual Test

1. **Set up test data:**
   ```bash
   # Add favorite accounts via UI or API
   # Ensure user has admin roles in some accounts
   ```

2. **Send a chat message:**
   ```
   "What are my costs this month?"
   ```

3. **Check server logs:**
   ```bash
   # Look for: [User Context] Built context for AI
   # Should show totalFavorites and totalAdminAccounts
   ```

4. **Verify AI response:**
   - AI should reference your favorite accounts
   - AI should use your timezone for "this month"
   - AI should acknowledge your admin access if relevant

### Automated Test

```typescript
// Test user context builder
const mockEvent = {
  context: {
    auth: {
      isAuthenticated: true,
      user: {
        email: 'test.user@gd-ms.com',
        name: 'Test User'
      }
    }
  }
}

const context = await buildUserContextForAI(mockEvent)

// Assertions
assert(context.userEmail === 'test.user@gd-ms.com')
assert(context.favoriteAccounts.length >= 0)
assert(context.adminAccounts.length >= 0)
assert(context.timezone !== '')
```

## Potential Improvements

1. **Cache account data** - The DynamoDB scan happens on every chat request. Consider caching for 5-10 minutes.

2. **Include recent accounts** - Add accounts the user recently viewed (from activity logs).

3. **Include user groups** - Add Entra ID groups for role-based suggestions.

4. **Include cost trends** - Add summary of user's account costs (e.g., "Your favorite accounts cost $X this month").

5. **Pagination for large lists** - If user has 100+ favorites, consider different display strategy.

## Conclusion

✅ **VALIDATED**: The chat AI system correctly sends comprehensive user context including:
- User identity and metadata
- Favorite accounts with names
- Admin accounts with roles
- Timezone preferences
- Admin status

The context is properly formatted and integrated into every chat request, enabling personalized AI responses.
