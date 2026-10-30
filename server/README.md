# Server API Documentation

## Overview

This server provides a comprehensive RESTful API for managing AWS resources across both Commercial and GovCloud environments. It features cross-account role assumption, account management with DynamoDB integration, Organizations support, automatic OpenAPI documentation, and a complete suite of AWS utilities.

## Architecture

```
server/
├── api/                  # API endpoints (file-based routing)
│   ├── accounts/        # Account management endpoints
│   ├── costs/           # Cost Explorer endpoints
│   ├── dynamodb/        # DynamoDB operations
│   └── health.get.ts    # Health check endpoint
├── lib/                  # Core libraries
│   ├── aws-client-factory.ts # Enhanced AWS client factory with cross-account support
│   └── config.ts        # Configuration management
├── utils/                # Utility functions
│   ├── api-response.ts  # Response formatting
│   ├── cost-explorer.ts # Cost Explorer utilities
│   ├── dynamodb.ts      # DynamoDB utilities
│   ├── accounts.ts      # Account management and lookup
│   └── organizations.ts # AWS Organizations utilities
├── types/                # TypeScript definitions
├── plugins/              # Nitro plugins
│   └── swagger.ts       # OpenAPI/Swagger integration
└── middleware/           # API middleware (future)
```

## Environment Configuration

Create a `.env` file based on `.env.example`:

```bash
# Commercial AWS
AWS_COMMERCIAL_ACCESS_KEY_ID=your-key
AWS_COMMERCIAL_SECRET_ACCESS_KEY=your-secret
AWS_COMMERCIAL_REGION=us-east-1
AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID=123456789012

# GovCloud AWS
AWS_GOVCLOUD_ACCESS_KEY_ID=your-key
AWS_GOVCLOUD_SECRET_ACCESS_KEY=your-secret
AWS_GOVCLOUD_REGION=us-gov-west-1
AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID=123456789012

# Cross-Account Role Configuration
AWS_ASSUME_ROLE_NAME=GDMSOrganizationsRole
AWS_ASSUME_ROLE_DURATION=3600

# Account Management  
# AWS_ACCOUNTS_TABLE_NAME=gdms-accounts
```

## API Documentation

Once the server is running, access the interactive API documentation at:
- **Swagger UI**: http://localhost:3000/api/docs
- **OpenAPI JSON**: http://localhost:3000/api/swagger.json

## Available Endpoints

### System
- `GET /api/health` - Health check and environment status

### Accounts
- `GET /api/accounts` - List AWS accounts from configured environments

### Costs
- `GET /api/costs/summary` - Get cost summary with grouping options

### Accounts
- `POST /api/accounts/lookup` - Lookup account by various criteria
- `GET /api/accounts/list` - List accounts from DynamoDB/Organizations
- `POST /api/accounts/sync` - Sync account data between sources

### Organizations
- `GET /api/organization/structure` - Get organizational unit hierarchy
- `GET /api/organization/accounts/[accountId]` - Get account from Organizations

## Creating New Endpoints

### 1. Basic Endpoint Structure

```typescript
// server/api/your-endpoint.get.ts
import { defineEventHandler } from 'h3'
import { sendSuccess, errors, handleAsync } from '../utils/api-response'

export default defineEventHandler(handleAsync(async (event) => {
  // Your logic here
  return sendSuccess(event, { data: 'example' })
}))
```

### 2. With OpenAPI Documentation

```typescript
import { registerEndpoint } from '../plugins/swagger'

// Register OpenAPI spec
registerEndpoint('/api/your-endpoint', 'GET', {
  summary: 'Your endpoint summary',
  description: 'Detailed description',
  tags: ['Category'],
  parameters: [
    { $ref: '#/components/parameters/Environment' }
  ],
  responses: {
    200: {
      description: 'Success response',
      content: {
        'application/json': {
          schema: { type: 'object' }
        }
      }
    }
  }
})
```

### 3. Using AWS Services

```typescript
import { getClient, getDynamoDBClient } from '../lib/aws-client-factory'

// Basic client usage
const client = await getDynamoDBClient('commercial') // or 'govcloud'

// Cross-account client usage  
const crossAccountClient = await getClient('govcloud', 'dynamodb', 'us-gov-west-1', '123456789012')

// Organizations client for master account
const orgClient = await getOrganizationsClient('commercial')
```

## Utility Functions

### DynamoDB Operations
- `getItem()` - Retrieve single item
- `putItem()` - Create/update item
- `updateItem()` - Update specific fields
- `deleteItem()` - Delete item
- `queryItems()` - Query with conditions
- `scanItems()` - Scan table
- `batchWriteItems()` - Batch write operations
- `batchGetItems()` - Batch read operations

### Cost Explorer Operations
- `getCostAndUsage()` - Get cost data
- `getCostForecast()` - Get cost forecasts
- `getCostsByService()` - Costs grouped by service
- `getCostsByAccount()` - Costs grouped by account
- `getCostsByRegion()` - Costs grouped by region
- `getTopSpendingServices()` - Top N spending services
- `getMonthOverMonthChange()` - Cost trend analysis

### Account Management Operations
- `lookupAccount()` - Find account by ID, email, request ID
- `getEnrichedAccount()` - Get account with Organizations data
- `getAllAccountsFromDynamoDB()` - List all accounts from table
- `getAllAccountsFromOrganizations()` - List from Organizations
- `searchAccounts()` - Search accounts by partial match
- `syncAccountData()` - Sync single account data
- `bulkSyncAccounts()` - Sync all accounts

### Organizations Operations
- `getOrganizationInfo()` - Get organization details
- `getOrganizationalUnitTree()` - Get OU hierarchy
- `listOrganizationalUnits()` - List OUs
- `getAccountOU()` - Get account's OU
- `moveAccount()` - Move account between OUs
- `getAccountPolicies()` - Get SCPs for account

### Response Utilities
- `sendSuccess()` - Send successful response
- `sendPaginated()` - Send paginated response
- `sendError()` - Send error response
- `errors.badRequest()` - 400 error
- `errors.notFound()` - 404 error
- `errors.serverError()` - 500 error
- `errors.awsError()` - AWS-specific errors

## Error Handling

All endpoints use standardized error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  },
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Best Practices

1. **Use the `handleAsync` wrapper** for all async endpoints
2. **Register OpenAPI documentation** for all endpoints
3. **Use environment parameter** to specify AWS environment
4. **Cache AWS clients** - They're automatically cached per environment
5. **Standardize responses** using utility functions
6. **Validate inputs** before processing
7. **Use TypeScript types** from `/server/types`
8. **Keep endpoints focused** - One responsibility per endpoint
9. **Use utility functions** instead of duplicating logic
10. **Document complex logic** with inline comments

## Testing Endpoints

```bash
# Health check
curl http://localhost:3000/api/health

# Get accounts (both environments)
curl http://localhost:3000/api/accounts

# Get commercial account only
curl http://localhost:3000/api/accounts?environment=commercial

# Get cost summary
curl "http://localhost:3000/api/costs/summary?startDate=2024-01-01&endDate=2024-01-31"

# DynamoDB operations
curl http://localhost:3000/api/dynamodb/my-table/items
curl -X POST http://localhost:3000/api/dynamodb/my-table/items \
  -H "Content-Type: application/json" \
  -d '{"id": "123", "name": "Test Item"}'
```

## Adding New AWS Services

1. Add the SDK package to `package.json`
2. Create a client factory in `/server/lib/aws-clients.ts`
3. Create utility functions in `/server/utils/`
4. Add TypeScript types in `/server/types/`
5. Create API endpoints in `/server/api/`
6. Register OpenAPI documentation

## Security Considerations

- Never commit `.env` files
- Use environment variables for all credentials
- Validate and sanitize all inputs
- Implement rate limiting for production
- Add authentication middleware as needed
- Use least-privilege IAM policies
- Audit AWS API calls with CloudTrail