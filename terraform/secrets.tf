# ============================================================================
# Secrets Manager Configuration for DynamoDB Tables
# ============================================================================
# Centralized configuration for all DynamoDB tables used by the application
# This secret should be populated manually or via CI/CD with the following structure

resource "aws_secretsmanager_secret" "dynamodb_config" {
  provider    = aws.target_deployment_account
  name        = "ghost-dynamodb-config-${var.env}"
  description = "DynamoDB table configuration for GHOST dashboard (${var.env})"

  tags = {
    Name        = "GHOST DynamoDB Configuration"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
  }
}

# Create a version with placeholder values
# In production, these should be updated via AWS Console, CLI, or CI/CD
resource "aws_secretsmanager_secret_version" "dynamodb_config" {
  provider  = aws.target_deployment_account
  secret_id = aws_secretsmanager_secret.dynamodb_config.id
  secret_string = jsonencode({
    # Scheduled Reports Tables (GovCloud)
    scheduledReports = {
      tableName   = "ghost-scheduled-reports"
      environment = "govcloud"
      region      = var.aws_region
      accountId   = local.child_account_id
    }
    emailTemplates = {
      tableName   = "ghost-email-templates"
      environment = "govcloud"
      region      = var.aws_region
      accountId   = local.child_account_id
    }
    reportExecutions = {
      tableName   = "ghost-report-executions"
      environment = "govcloud"
      region      = var.aws_region
      accountId   = local.child_account_id
    }
    reportExecutionLocks = {
      tableName   = "ghost-report-execution-locks"
      environment = "govcloud"
      region      = var.aws_region
      accountId   = local.child_account_id
    }

    # API Keys Tables (GovCloud Account B - where app is deployed)
    apiKeys = {
      tableName   = "ghost-api-keys"
      environment = "govcloud"
      region      = var.aws_region
      accountId   = local.child_account_id
    }
    apiKeysUsage = {
      tableName   = "ghost-api-keys-usage"
      environment = "govcloud"
      region      = var.aws_region
      accountId   = local.child_account_id
    }

    # Shortlinks Table (GovCloud)
    shortlinks = {
      tableName   = "ghost-dashboard-shortlinks"
      environment = "govcloud"
      region      = var.aws_region
      accountId   = local.child_account_id
    }

    # Query System Tables (GovCloud)
    savedQueries = {
      tableName   = "ghost-saved-queries"
      environment = "govcloud"
      region      = var.aws_region
      accountId   = local.child_account_id
    }
    queryExecutions = {
      tableName   = "ghost-query-executions"
      environment = "govcloud"
      region      = var.aws_region
      accountId   = local.child_account_id
    }
    datasetExportJobs = {
      tableName   = aws_dynamodb_table.dataset_export_jobs.name
      environment = "govcloud"
      region      = var.aws_region
      accountId   = local.child_account_id
    }
    aiUsage = {
      tableName   = aws_dynamodb_table.ai_usage.name
      environment = "govcloud"
      region      = var.aws_region
      accountId   = local.child_account_id
    }

    # External Accounts Table (GovCloud, in master/org account)
    externalAccounts = {
      tableName   = "gdms_aws_accounts-master"
      environment = "govcloud"
      region      = var.aws_region
      accountId   = local.org_account_id
      readOnly    = true
    }

    # External budget alert tables live in the Commercial monitoring account.
    budgetAlerts = {
      tableName   = "budget-alert-system-alert-history-prod"
      environment = "commercial"
      region      = "us-east-1"
      accountId   = "253821132832"
      readOnly    = true
    }
    budgetAlertConfig = {
      tableName   = "budget-alert-system-config-prod"
      environment = "commercial"
      region      = "us-east-1"
      accountId   = "253821132832"
      readOnly    = false
    }
  })

  lifecycle {
    ignore_changes = [secret_string] # Don't overwrite manual updates
  }
}

# Output the secret ARN for reference in ECS task definition
output "dynamodb_config_secret_arn" {
  description = "ARN of the DynamoDB configuration secret"
  value       = aws_secretsmanager_secret.dynamodb_config.arn
}

output "dynamodb_config_secret_name" {
  description = "Name of the DynamoDB configuration secret"
  value       = aws_secretsmanager_secret.dynamodb_config.name
}
