# Scheduled Reports Infrastructure Setup

This script creates the necessary AWS infrastructure for the Scheduled Reports feature, including DynamoDB tables, SES email configuration, SNS topics, and EventBridge rules.

## Prerequisites

1. **AWS Credentials**: Ensure AWS credentials are configured with appropriate permissions
   ```bash
   export AWS_ACCESS_KEY_ID=your-access-key
   export AWS_SECRET_ACCESS_KEY=your-secret-key
   export AWS_SESSION_TOKEN=your-session-token  # if using temporary credentials
   ```

2. **Required IAM Permissions**:
   - `dynamodb:CreateTable`
   - `dynamodb:DescribeTable`
   - `ses:CreateEmailIdentity`
   - `ses:GetEmailIdentity`
   - `ses:CreateConfigurationSet`
   - `sns:CreateTopic`
   - `events:PutRule`
   - `events:DescribeRule`

3. **Node.js and tsx**: Make sure you have Node.js installed and tsx for running TypeScript

## Usage

### Basic Usage (GovCloud)

```bash
npx tsx scripts/setup-scheduled-reports-infra.ts
```

### Specify Environment

```bash
# For Commercial AWS
npx tsx scripts/setup-scheduled-reports-infra.ts --environment=commercial

# For GovCloud AWS
npx tsx scripts/setup-scheduled-reports-infra.ts --environment=govcloud
```

### Specify Domain

```bash
npx tsx scripts/setup-scheduled-reports-infra.ts --domain=yourdomain.com
```

### Full Example

```bash
npx tsx scripts/setup-scheduled-reports-infra.ts \
  --environment=govcloud \
  --domain=ghost-dashboard.example.com
```

## What Gets Created

### DynamoDB Tables

1. **ghost-scheduled-reports**
   - Primary Key: `reportId` (hash), `createdAt` (range)
   - GSI: `UserStatusIndex` - for querying user's reports by status
   - GSI: `NextRunTimeIndex` - for scheduler to find due reports
   - TTL enabled on `expiresAt` attribute

2. **ghost-email-templates**
   - Primary Key: `templateId` (hash), `createdAt` (range)
   - GSI: `TemplateTypeIndex` - for querying templates by type

3. **ghost-report-executions**
   - Primary Key: `reportId` (hash), `executionTime` (range)
   - TTL enabled on `expiresAt` attribute (auto-delete after 30 days)

### SES Resources

1. **Email Identity**: `noreply@yourdomain.com`
   - Requires email verification (check inbox for verification email)
   - For production, consider using domain identity instead

2. **Configuration Set**: `ghost-scheduled-reports`
   - TLS policy: REQUIRE (enforces encrypted connections)

### SNS Resources

1. **Topic**: `ghost-ses-notifications`
   - Used for SES bounce and complaint notifications

### EventBridge Resources

1. **Rule**: `ghost-ses-delivery-tracking`
   - Tracks SES email sending events

## Post-Setup Steps

### 1. Verify SES Email Identity

Check your email inbox for a verification email from AWS SES and click the verification link.

**Alternative: Use AWS Console**
```bash
# Open AWS Console > SES > Email Addresses
# Click on noreply@yourdomain.com and click "Send Test Email"
```

### 2. Enable DynamoDB TTL (if not already enabled)

```bash
# For scheduled reports table
aws dynamodb update-time-to-live \
  --table-name ghost-scheduled-reports \
  --time-to-live-specification "Enabled=true, AttributeName=expiresAt"

# For report executions table
aws dynamodb update-time-to-live \
  --table-name ghost-report-executions \
  --time-to-live-specification "Enabled=true, AttributeName=expiresAt"
```

### 3. Configure SNS Subscriptions

Subscribe to the SNS topic for bounce/complaint notifications:

```bash
# Subscribe an email address
aws sns subscribe \
  --topic-arn <topic-arn-from-output> \
  --protocol email \
  --notification-endpoint your-monitoring-email@example.com
```

### 4. Update Environment Variables

Add these to your `.env` file:

```bash
# DynamoDB Tables
SCHEDULED_REPORTS_TABLE=ghost-scheduled-reports
EMAIL_TEMPLATES_TABLE=ghost-email-templates
REPORT_EXECUTIONS_TABLE=ghost-report-executions

# SES Configuration
SES_FROM_EMAIL=noreply@yourdomain.com
SES_CONFIGURATION_SET=ghost-scheduled-reports
SES_NOTIFICATIONS_TOPIC_ARN=<topic-arn-from-output>

# Scheduler (optional, enabled by default)
REPORT_SCHEDULER_ENABLED=true
```

### 5. Test SES Sending (Optional)

Test that SES is working properly:

```bash
aws sesv2 send-email \
  --from-email-address noreply@yourdomain.com \
  --destination ToAddresses=your-test-email@example.com \
  --content "Subject={Data=Test Email},Body={Text={Data=This is a test email}}"
```

## Troubleshooting

### Issue: "Email identity not verified"

**Solution**: Check your email for the verification email from AWS SES and click the verification link.

### Issue: "Access Denied" errors

**Solution**: Ensure your AWS credentials have the required IAM permissions listed above.

### Issue: "Table already exists"

**Solution**: The script will skip existing resources. If you need to recreate a table, delete it first:

```bash
aws dynamodb delete-table --table-name ghost-scheduled-reports
```

### Issue: SES in Sandbox Mode

If you're in SES sandbox mode, you can only send emails to verified email addresses.

**Solution**: Request production access via AWS Console:
1. Go to AWS Console > SES
2. Click "Request Production Access"
3. Fill out the form with your use case

## Verification

After setup, verify everything is working:

```bash
# Check DynamoDB tables
aws dynamodb list-tables | grep ghost

# Check SES identities
aws sesv2 list-email-identities

# Check SNS topics
aws sns list-topics | grep ghost-ses-notifications

# Check EventBridge rules
aws events list-rules | grep ghost-ses-delivery-tracking
```

## Cleanup

To remove all created resources:

```bash
# Delete DynamoDB tables
aws dynamodb delete-table --table-name ghost-scheduled-reports
aws dynamodb delete-table --table-name ghost-email-templates
aws dynamodb delete-table --table-name ghost-report-executions

# Delete SES configuration set
aws sesv2 delete-configuration-set --configuration-set-name ghost-scheduled-reports

# Delete SES email identity
aws sesv2 delete-email-identity --email-identity noreply@yourdomain.com

# Delete SNS topic (replace with actual ARN)
aws sns delete-topic --topic-arn <topic-arn>

# Delete EventBridge rule
aws events delete-rule --name ghost-ses-delivery-tracking
```

## Notes

- **Cost**: All resources use on-demand pricing. Expected costs are minimal for typical usage.
- **Region**: The script uses `us-gov-west-1` for GovCloud and `us-east-1` for Commercial.
- **Tags**: All resources are tagged with `ManagedBy=Script`, `Service=GHOST`, and `Environment`.
- **TTL**: DynamoDB TTL must be enabled manually or via a separate AWS CLI command.
- **SES Sandbox**: New AWS accounts start in SES sandbox mode with sending limits.

## Support

For issues or questions:
1. Check the main project README
2. Review AWS service quotas and limits
3. Check CloudWatch Logs for runtime errors
