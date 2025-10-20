# DynamoDB Table for Scheduled Reports
resource "aws_dynamodb_table" "scheduled_reports" {
  name           = "ghost-scheduled-reports"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "reportId"
  range_key      = "createdAt"

  attribute {
    name = "reportId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  attribute {
    name = "userIdStatus"
    type = "S"
  }

  attribute {
    name = "nextRunTime"
    type = "S"
  }

  # GSI for querying user's reports by status
  global_secondary_index {
    name            = "UserStatusIndex"
    hash_key        = "userIdStatus"
    range_key       = "nextRunTime"
    projection_type = "ALL"
  }

  # GSI for scheduler to query upcoming reports
  global_secondary_index {
    name            = "NextRunTimeIndex"
    hash_key        = "nextRunTime"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = {
    Name        = "GHOST Scheduled Reports"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
  }
}

# DynamoDB Table for Email Templates
resource "aws_dynamodb_table" "email_templates" {
  name           = "ghost-email-templates"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "templateId"
  range_key      = "createdAt"

  attribute {
    name = "templateId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  attribute {
    name = "templateType"
    type = "S"
  }

  # GSI for querying by template type
  global_secondary_index {
    name            = "TemplateTypeIndex"
    hash_key        = "templateType"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  tags = {
    Name        = "GHOST Email Templates"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
  }
}

# DynamoDB Table for Report Execution History
resource "aws_dynamodb_table" "report_executions" {
  name           = "ghost-report-executions"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "reportId"
  range_key      = "executionTime"

  attribute {
    name = "reportId"
    type = "S"
  }

  attribute {
    name = "executionTime"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = {
    Name        = "GHOST Report Execution History"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
  }
}

# Output table names for application configuration
output "scheduled_reports_table_name" {
  description = "Name of the DynamoDB table for scheduled reports"
  value       = aws_dynamodb_table.scheduled_reports.name
}

output "email_templates_table_name" {
  description = "Name of the DynamoDB table for email templates"
  value       = aws_dynamodb_table.email_templates.name
}

output "report_executions_table_name" {
  description = "Name of the DynamoDB table for report executions"
  value       = aws_dynamodb_table.report_executions.name
}
