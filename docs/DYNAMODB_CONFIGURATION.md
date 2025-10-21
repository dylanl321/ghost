# DynamoDB Configuration

This document describes the DynamoDB tables used by the GHOST dashboard and how they are configured.

## Overview

The GHOST dashboard uses several DynamoDB tables for storing application data. All tables are managed via Terraform and configuration is centralized through AWS Secrets Manager.

### Architecture Context

**Important**: The application deployment follows this architecture:
- **Account A**: Organization account with AWS Organizations access
- **Account B**: Deployment account (461760157232) where the ECS app and DynamoDB tables reside
- **Credentials**: Environment variables contain Account A credentials for cross-account Organizations access
- **DynamoDB Access**: Uses ECS task role to access local DynamoDB tables in Account B

This means:
- `AWS_GOVCLOUD_*` credentials = Account A (for Organizations, cross-account operations)
- DynamoDB tables = Account B (same account as ECS deployment)
- DynamoDB access = ECS task IAM role (not env var credentials)

## Configuration Architecture

### Configuration Hierarchy

The application loads DynamoDB configuration in the following order:

1. **AWS Secrets Manager** (Production) - Preferred source for deployed environments
2. **Environment Variables** (Development/Fallback) - Used for local development
3. **Default Values** (Last Resort) - Hardcoded defaults if all else fails

### Configuration Loader

Location: `server/lib/dynamodb-config.ts`

The configuration loader provides a centralized way to access DynamoDB table information:

```typescript
import { getTableName, getTableEnvironment, getTableConfig } from '@/server/lib/dynamodb-config'

// Get table name
const tableName = await getTableName('apiKeys')

// Get environment (commercial or govcloud)
const environment = await getTableEnvironment('apiKeys')

// Get full configuration
const config = await getTableConfig('apiKeys')
```

## Tables

### 1. Scheduled Reports (`ghost-scheduled-reports`)

**Purpose**: Stores scheduled cost reports configuration
**Environment**: GovCloud
**Terraform**: `terraform/scheduled-reports.tf`
**Config Key**: `scheduledReports`

**Attributes:**
- `reportId` (Hash Key) - Unique report identifier
- `createdAt` (Range Key) - Report creation timestamp
- `nextRunTime` - When the report should run next
- `userIdStatus` - GSI for querying user's reports by status

**Indexes:**
- `UserStatusIndex` - Query reports by user and status
- `NextRunTimeIndex` - Query upcoming reports

### 2. Email Templates (`ghost-email-templates`)

**Purpose**: Stores email templates for scheduled reports
**Environment**: GovCloud
**Terraform**: `terraform/scheduled-reports.tf`
**Config Key**: `emailTemplates`

**Attributes:**
- `templateId` (Hash Key) - Unique template identifier
- `createdAt` (Range Key) - Template creation timestamp
- `templateType` - Type of template (GSI)

**Indexes:**
- `TemplateTypeIndex` - Query templates by type

### 3. Report Executions (`ghost-report-executions`)

**Purpose**: Stores execution history for scheduled reports
**Environment**: GovCloud
**Terraform**: `terraform/scheduled-reports.tf`
**Config Key**: `reportExecutions`

**Attributes:**
- `reportId` (Hash Key) - Report identifier
- `executionTime` (Range Key) - When the report was executed
- `expiresAt` (TTL) - Auto-delete after 30 days

### 4. API Keys (`ghost-api-keys`)

**Purpose**: Stores API keys for non-interactive access
**Environment**: GovCloud (Account B - deployment account)
**Terraform**: `terraform/dynamodb-tables.tf`
**Config Key**: `apiKeys`

**Attributes:**
- `id` (Hash Key) - Unique key identifier
- `createdBy` - User who created the key (GSI)
- `isActive` - Whether key is active (GSI)

**Indexes:**
- `CreatedByIndex` - Query keys by creator
- `ActiveKeysIndex` - Query active keys

### 5. API Keys Usage (`ghost-api-keys-usage`)

**Purpose**: Tracks API key usage for audit purposes
**Environment**: GovCloud (Account B - deployment account)
**Terraform**: `terraform/dynamodb-tables.tf`
**Config Key**: `apiKeysUsage`

**Attributes:**
- `keyId` (Hash Key) - API key identifier
- `timestamp` (Range Key) - Usage timestamp
- `endpoint` - API endpoint called (GSI)
- `ttl` - Auto-delete after 90 days

**Indexes:**
- `EndpointIndex` - Query usage by endpoint

### 6. Shortlinks (`ghost-dashboard-shortlinks`)

**Purpose**: Stores URL shortlinks for dashboard sharing
**Environment**: GovCloud
**Terraform**: `terraform/dynamodb-tables.tf`
**Config Key**: `shortlinks`

**Attributes:**
- `shortCode` (Hash Key) - Short URL code
- `createdBy` - User who created the link (GSI)
- `ttl` - Auto-delete expired links

**Indexes:**
- `CreatedByIndex` - Query links by creator

### 7. AWS Accounts (External) (`gdms_aws_accounts-master`)

**Purpose**: External table with AWS account metadata
**Environment**: GovCloud
**Terraform**: Not managed (external table)
**Config Key**: `externalAccounts`
**Access**: Read-only

**Note**: This table is managed by external systems and should not be modified by the GHOST dashboard.

## Environment Configuration

### Production (via Secrets Manager)

In production, table configuration is stored in AWS Secrets Manager:

**Secret Name**: `ghost-dynamodb-config-{env}` (e.g., `ghost-dynamodb-config-prod`)

**Secret Structure**:
```json
{
  "scheduledReports": {
    "tableName": "ghost-scheduled-reports",
    "environment": "govcloud",
    "region": "us-gov-west-1",
    "accountId": "461760157232"
  },
  "apiKeys": {
    "tableName": "ghost-api-keys",
    "environment": "commercial",
    "region": "us-east-1",
    "accountId": "123456789012"
  },
  ...
}
```

### Development (via Environment Variables)

For local development, use environment variables:

```bash
# Scheduled Reports
SCHEDULED_REPORTS_TABLE=ghost-scheduled-reports
EMAIL_TEMPLATES_TABLE=ghost-email-templates
REPORT_EXECUTIONS_TABLE=ghost-report-executions

# API Keys (GovCloud Account B)
DYNAMODB_API_KEYS_TABLE=ghost-api-keys
DYNAMODB_API_KEY_USAGE_TABLE=ghost-api-keys-usage
API_KEYS_STORAGE_ENV=govcloud

# DynamoDB Access Method
# In production (ECS), use task role instead of env var credentials
# This is because tables are in Account B but env vars have Account A credentials
DYNAMODB_USE_TASK_ROLE=true

# Shortlinks
SHORTLINKS_TABLE=ghost-dashboard-shortlinks

# External Accounts
AWS_ACCOUNTS_TABLE_NAME=gdms_aws_accounts-master
```

### Cross-Account Architecture

The application uses a special credential strategy:

1. **Organizations Access (Account A)**:
   - Uses `AWS_GOVCLOUD_ACCESS_KEY_ID` / `AWS_GOVCLOUD_SECRET_ACCESS_KEY`
   - For accessing AWS Organizations and cross-account resources

2. **DynamoDB Access (Account B)**:
   - Uses ECS task IAM role (not env var credentials)
   - Controlled by `DYNAMODB_USE_TASK_ROLE=true`
   - Only applies when running in ECS

The `aws-client-factory.ts` automatically handles this:
- When `DYNAMODB_USE_TASK_ROLE=true` and running in ECS
- DynamoDB clients use undefined credentials
- AWS SDK falls back to ECS task role
- Task role has permissions defined in `terraform/iam.tf`

## Deployment

### 1. Apply Terraform

```bash
cd terraform

# Initialize (if needed)
terraform init -backend-config=conf/dev.conf

# Plan changes
terraform plan

# Apply changes
terraform apply
```

This creates:
- All DynamoDB tables
- IAM permissions
- Secrets Manager secret (with placeholder values)

### 2. Update Secrets Manager

After Terraform creates the secret, update it with actual values:

```bash
# Update the secret via AWS CLI
aws secretsmanager put-secret-value \
  --secret-id ghost-dynamodb-config-dev \
  --secret-string file://dynamodb-config.json
```

### 3. Deploy Application

The ECS task definition automatically injects the secret as the `DYNAMODB_CONFIG` environment variable.

## IAM Permissions

The ECS task execution role has the following DynamoDB permissions:

- **Full Access** (Read/Write):
  - `ghost-scheduled-reports` (+ indexes)
  - `ghost-email-templates` (+ indexes)
  - `ghost-report-executions`
  - `ghost-api-keys` (+ indexes)
  - `ghost-api-keys-usage` (+ indexes)
  - `ghost-dashboard-shortlinks` (+ indexes)

- **Read-Only Access**:
  - `gdms_aws_accounts-master` (+ indexes)

## Migration from Hardcoded Values

If you're migrating from hardcoded table names:

1. The config loader automatically falls back to environment variables
2. Existing `.env` files continue to work
3. Once Secrets Manager is configured, it takes precedence
4. No code changes needed in application logic

## Troubleshooting

### Configuration not loading

**Check Secrets Manager secret exists:**
```bash
aws secretsmanager describe-secret --secret-id ghost-dynamodb-config-dev
```

**Check IAM permissions:**
```bash
aws iam get-role-policy --role-name ECS-Task-ghost-dashboard-dev-Role --policy-name ghost-dashboard-dev_secrets_policy
```

### Table not found errors

**Verify table exists:**
```bash
aws dynamodb describe-table --table-name ghost-api-keys --region us-gov-west-1
```

**Check IAM permissions:**
```bash
# Check the ECS task role has DynamoDB permissions
aws iam get-role-policy \
  --role-name ECS-Task-ghost-dashboard-dev-Role \
  --policy-name ghost-dashboard-dev_api_keys_dynamodb
```

### Access Denied errors

If you see "Access Denied" when accessing DynamoDB:

1. **Verify `DYNAMODB_USE_TASK_ROLE=true`** in ECS task definition
2. **Check ECS task role** has the correct DynamoDB permissions (see `terraform/iam.tf`)
3. **Ensure tables are in Account B** (461760157232) where the app is deployed
4. **Verify region** matches (`us-gov-west-1`)

**Common issue**: Using Account A credentials to access Account B tables won't work. The task role must be used.

### Cache issues

The config loader caches for 5 minutes. To force reload:

```typescript
import { clearConfigCache } from '@/server/lib/dynamodb-config'
clearConfigCache()
```

### Credential issues

**Error**: "Missing AWS credentials for govcloud environment"
- This is expected! The app uses Account A credentials for Organizations
- For DynamoDB, it should use the ECS task role (when `DYNAMODB_USE_TASK_ROLE=true`)

**Error**: "UnrecognizedClientException" or "InvalidClientTokenId"
- Likely using Account A credentials to access Account B tables
- Ensure `DYNAMODB_USE_TASK_ROLE=true` is set
- Check ECS task role permissions

## Configuration Keys

| Config Key | Table Name | Environment | Account | Purpose |
|------------|------------|-------------|---------|---------|
| `scheduledReports` | `ghost-scheduled-reports` | GovCloud | Account B | Scheduled cost reports |
| `emailTemplates` | `ghost-email-templates` | GovCloud | Account B | Email templates |
| `reportExecutions` | `ghost-report-executions` | GovCloud | Account B | Execution history |
| `apiKeys` | `ghost-api-keys` | GovCloud | Account B | API keys storage |
| `apiKeysUsage` | `ghost-api-keys-usage` | GovCloud | Account B | API usage tracking |
| `shortlinks` | `ghost-dashboard-shortlinks` | GovCloud | Account B | URL shortlinks |
| `externalAccounts` | `gdms_aws_accounts-master` | GovCloud | Account B | AWS accounts (external) |

**Note**: All tables are in Account B (deployment account: 461760157232) and accessed via ECS task role.

## Best Practices

1. **Never hardcode table names** - Always use the config loader
2. **Use appropriate config keys** - Reference the table above
3. **Handle errors gracefully** - Config loader returns defaults on failure
4. **Update Secrets Manager** - Don't rely on environment variables in production
5. **Test locally** - Use `.env` file for local development
6. **Document changes** - Update this file when adding new tables

## Related Files

- `terraform/dynamodb-tables.tf` - Table definitions
- `terraform/secrets.tf` - Secrets Manager configuration
- `terraform/iam.tf` - IAM permissions
- `server/lib/dynamodb-config.ts` - Configuration loader
- `.env.example` - Environment variable examples
