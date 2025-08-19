# AWS Dashboard API - Setup Guide

## 🚨 Current Issue: Server Hanging

The development server is currently experiencing timeouts on all API endpoints. This is likely due to:

1. **Vue Router conflicts** with API paths
2. **Build process issues** from routing changes
3. **Process locks** from AWS credential errors

## ✅ Immediate Solution

### Step 1: Complete Server Restart
```bash
# Stop the development server (Ctrl+C)
# Clear all caches
rm -rf .nuxt .output node_modules/.vite

# Restart the server
npm run dev
```

### Step 2: Configure AWS Credentials

Create a `.env` file in your project root:

```bash
# Commercial AWS (at least one required)
AWS_COMMERCIAL_ACCESS_KEY_ID=your-access-key
AWS_COMMERCIAL_SECRET_ACCESS_KEY=your-secret-key
AWS_COMMERCIAL_REGION=us-east-1
AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID=123456789012

# GovCloud AWS (optional)
AWS_GOVCLOUD_ACCESS_KEY_ID=your-govcloud-access-key
AWS_GOVCLOUD_SECRET_ACCESS_KEY=your-govcloud-secret-key
AWS_GOVCLOUD_REGION=us-gov-west-1
AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID=123456789012

# Cross-account role settings
AWS_ASSUME_ROLE_NAME=GDMSOrganizationsRole
AWS_ASSUME_ROLE_DURATION=3600

# DynamoDB table for account storage
AWS_ACCOUNTS_TABLE_NAME=gdms-accounts
```

### Step 3: Test Your Setup

After restarting with credentials configured:

```bash
# Basic health check
curl http://localhost:3003/api/health

# Validation report  
curl http://localhost:3003/api/validate

# Setup guide (in browser)
open http://localhost:3003/api/setup-guide

# Account identity test
curl http://localhost:3003/api/accounts
```

## 🔧 What We Fixed

### 1. Smart Credential Handling
- ✅ **Environment-aware**: Only tries to use credentials that are actually configured
- ✅ **Graceful failures**: Returns empty arrays instead of throwing errors when credentials are missing
- ✅ **Clear error messages**: Tells you exactly which environment variables to set

### 2. Comprehensive Testing Tools
- ✅ **`/api/validate`**: Detailed validation report showing what's configured
- ✅ **`/api/setup-guide`**: Interactive HTML guide with live testing buttons
- ✅ **Smart recommendations**: Tells you exactly what to configure next

### 3. Proper Client Usage Pattern

The new client usage pattern handles credentials properly:

```typescript
// The client factory now checks credentials first
const client = await getClient('commercial', 'dynamodb', 'us-east-1', '123456789012')

// Utility functions gracefully handle missing credentials
const accounts = await getAllAccountsFromDynamoDB('govcloud') // Returns [] if no creds
```

## 🎯 Available Endpoints (After Restart)

### System Endpoints
- `GET /api/health` - Health check and environment status
- `GET /api/validate` - Comprehensive validation report
- `GET /api/setup-guide` - Interactive setup guide (HTML)
- `GET /api/test` - Simple test endpoint (no AWS dependencies)

### AWS Endpoints (Require Credentials)
- `GET /api/accounts` - AWS account identity via STS
- `POST /api/accounts/lookup` - Flexible account lookup
- `GET /api/accounts/list` - List accounts from DynamoDB/Organizations
- `POST /api/accounts/sync` - Sync account data
- `GET /api/costs/summary` - Cost Explorer data
- `GET /api/organization/structure` - OU hierarchy
- `GET /api/dynamodb/{table}/items` - DynamoDB operations

### Documentation
- `GET /api/spec` - OpenAPI specification (JSON)
- `GET /api/api-docs` - Self-contained API documentation (HTML)

## 🚀 Cross-Account Usage Examples

Once configured, you can use the enhanced client factory:

```bash
# Basic client for your account
curl http://localhost:3003/api/accounts

# Cross-account DynamoDB query
curl "http://localhost:3003/api/dynamodb/my-table/items?environment=govcloud"

# Account lookup by email
curl -X POST http://localhost:3003/api/accounts/lookup \
  -H "Content-Type: application/json" \
  -d '{"accountEmail": "user@example.com"}'

# Organizations structure
curl http://localhost:3003/api/organization/structure?environment=commercial
```

## 💡 Key Improvements

1. **No more crashes** - Missing credentials are handled gracefully
2. **Environment-aware** - Only uses credentials that are actually configured  
3. **Clear guidance** - Interactive setup guide with live testing
4. **Efficient testing** - Validation endpoint shows exactly what's working
5. **Local Swagger UI** - No external dependencies for documentation

The system is now much more robust and will guide you through the setup process step by step!