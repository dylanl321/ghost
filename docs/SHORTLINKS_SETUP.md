# Shortlinks Setup Guide

## Overview
The shortlinks feature allows users to create shareable links for cost analytics views. Instead of long URLs with multiple parameters, users get clean short URLs like `https://yourdomain.com/s/ABC123XY`.

## Infrastructure Setup

### DynamoDB Table
The shortlinks are stored in a DynamoDB table in AWS GovCloud account `461760157232`.

**Table Details:**
- **Name:** `ghost-dashboard-shortlinks`
- **Region:** `us-gov-west-1`
- **Billing:** Pay-per-request (on-demand)
- **Primary Key:** `shortCode` (String)
- **GSI:** `CreatedByIndex` (for querying links by creator)
- **TTL:** Configured on `ttl` attribute for automatic expiration

### One-Time Setup

#### Prerequisites
1. AWS GovCloud credentials configured in `.env` file:
   ```bash
   AWS_GOVCLOUD_ACCESS_KEY_ID=<your-key-id>
   AWS_GOVCLOUD_SECRET_ACCESS_KEY=<your-secret-key>
   AWS_GOVCLOUD_REGION=us-gov-west-1
   ```
   
   These credentials should have permissions to create and manage DynamoDB tables in the GovCloud account.

#### Running the Setup Script

1. **Using the shell script (recommended):**
   ```bash
   ./scripts/setup-shortlinks-govcloud.sh
   ```

2. **Using Node.js directly:**
   ```bash
   node scripts/create-shortlinks-table.js
   ```

The script will:
- Assume the role in GovCloud account
- Check if the table already exists
- Create the table with proper schema and indexes
- Wait for the table to become active
- Display setup confirmation

### Post-Setup Configuration

After running the script, complete these steps in the AWS Console:

1. **Enable TTL:**
   - Navigate to DynamoDB in GovCloud console
   - Select the `ghost-dashboard-shortlinks` table
   - Go to "Additional settings" tab
   - Enable TTL on the `ttl` attribute

2. **Enable Point-in-time Recovery (optional but recommended):**
   - In the table's "Backups" tab
   - Enable point-in-time recovery for data protection

3. **Verify IAM Permissions:**
   Ensure the application's IAM role has these permissions:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "dynamodb:GetItem",
           "dynamodb:PutItem",
           "dynamodb:UpdateItem",
           "dynamodb:Query",
           "dynamodb:Scan"
         ],
         "Resource": [
           "arn:aws-us-gov:dynamodb:us-gov-west-1:461760157232:table/ghost-dashboard-shortlinks",
           "arn:aws-us-gov:dynamodb:us-gov-west-1:461760157232:table/ghost-dashboard-shortlinks/index/*"
         ]
       }
     ]
   }
   ```

## Application Configuration

### Environment Variables
Ensure these are set in your `.env` file:
```env
# GovCloud configuration for shortlinks
AWS_GOVCLOUD_ACCESS_KEY_ID=<your-key-id>
AWS_GOVCLOUD_SECRET_ACCESS_KEY=<your-secret-key>
AWS_GOVCLOUD_REGION=us-gov-west-1
```

### Code Configuration
The shortlinks library is configured to use GovCloud:
- File: `/server/lib/shortlinks.ts`
- Environment: `govcloud`
- Uses direct GovCloud credentials from environment variables

## Feature Usage

### Creating a Share Link
1. Navigate to Cost Analytics page
2. Select desired accounts, timeframe, and filters
3. Click the "Share" button in the header
4. A modal will show with the generated short URL
5. Copy and share the link

### Using a Share Link
1. User visits the short URL (e.g., `/s/ABC123XY`)
2. If not authenticated, redirected to login (URL preserved)
3. After authentication, shortlink data is loaded
4. User is redirected to the cost analytics page with shared state applied

### Link Expiration
- Default expiration: 30 days
- Configurable via `expiresInDays` parameter
- Expired links are automatically cleaned up via DynamoDB TTL

## Troubleshooting

### Common Issues

1. **Table creation fails with permissions error:**
   - Verify the IAM role ARN is correct
   - Ensure the role has DynamoDB create permissions
   - Check if external ID is required for role assumption

2. **Shortlinks not working in application:**
   - Verify the table exists in GovCloud
   - Check application has correct AWS credentials
   - Ensure DynamoDB permissions are configured

3. **Links expire too quickly:**
   - Check TTL configuration in DynamoDB console
   - Verify `expiresInDays` parameter in code

### Monitoring
Monitor the feature via:
- CloudWatch metrics for DynamoDB table
- Application logs for shortlink creation/retrieval
- Table item count and size metrics

## Security Considerations

1. **Access Control:**
   - Shortlinks are accessible to any authenticated user
   - Consider implementing user-specific access controls if needed

2. **Data Privacy:**
   - Shortlinks store account selections and filter states
   - Ensure no sensitive data is included in the shared state

3. **Link Sharing:**
   - Links can be shared externally
   - Implement rate limiting if abuse is a concern
   - Monitor for unusual access patterns

## Maintenance

### Regular Tasks
- Monitor table size and costs
- Review expired link cleanup (TTL)
- Audit shortlink usage patterns
- Update expiration policies as needed

### Backup Strategy
- Enable point-in-time recovery
- Consider periodic exports for long-term retention
- Document recovery procedures