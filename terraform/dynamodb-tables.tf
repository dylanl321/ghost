# ============================================================================
# DynamoDB Tables Configuration
# ============================================================================
# This file defines DynamoDB tables for API keys, usage tracking, and shortlinks
# Note: Scheduled reports tables are in scheduled-reports.tf

# ============================================================================
# API Keys Table (Commercial Environment)
# ============================================================================
resource "aws_dynamodb_table" "api_keys" {
  provider       = aws.target_deployment_account
  name           = "ghost-api-keys"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "createdBy"
    type = "S"
  }

  attribute {
    name = "isActive"
    type = "S"
  }

  # GSI for querying keys by creator
  global_secondary_index {
    name            = "CreatedByIndex"
    hash_key        = "createdBy"
    projection_type = "ALL"
  }

  # GSI for querying active keys
  global_secondary_index {
    name            = "ActiveKeysIndex"
    hash_key        = "isActive"
    projection_type = "ALL"
  }

  # Enable encryption at rest
  server_side_encryption {
    enabled = true
  }

  # Enable point-in-time recovery for production
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "GHOST API Keys"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "APIKeys"
  }
}

# ============================================================================
# API Keys Usage History Table (Commercial Environment)
# ============================================================================
resource "aws_dynamodb_table" "api_keys_usage" {
  provider       = aws.target_deployment_account
  name           = "ghost-api-keys-usage"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "keyId"
  range_key      = "timestamp"

  attribute {
    name = "keyId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "endpoint"
    type = "S"
  }

  # GSI for querying usage by endpoint
  global_secondary_index {
    name            = "EndpointIndex"
    hash_key        = "endpoint"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # Enable TTL to auto-delete old usage records (90 days)
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # Enable encryption at rest
  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "GHOST API Keys Usage"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "APIKeyUsage"
  }
}

# ============================================================================
# Shortlinks Table (GovCloud Environment)
# ============================================================================
resource "aws_dynamodb_table" "shortlinks" {
  provider       = aws.target_deployment_account
  name           = "ghost-dashboard-shortlinks"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "shortCode"

  attribute {
    name = "shortCode"
    type = "S"
  }

  attribute {
    name = "createdBy"
    type = "S"
  }

  # GSI for querying shortlinks by creator
  global_secondary_index {
    name            = "CreatedByIndex"
    hash_key        = "createdBy"
    projection_type = "ALL"
  }

  # Enable TTL for expiring shortlinks
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # Enable encryption at rest
  server_side_encryption {
    enabled = true
  }

  # Enable point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "GHOST Dashboard Shortlinks"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "Shortlinks"
  }
}

# ============================================================================
# Shared Reports Table (GovCloud Environment)
# ============================================================================
resource "aws_dynamodb_table" "shared_reports" {
  provider       = aws.target_deployment_account
  name           = "ghost-shared-reports"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "shareId"

  attribute {
    name = "shareId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  # GSI for querying reports by user (for profile "My Reports" tab)
  global_secondary_index {
    name            = "UserIdIndex"
    hash_key        = "userId"
    projection_type = "ALL"
  }

  # Enable TTL to auto-delete old shared reports (90 days)
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # Enable encryption at rest
  server_side_encryption {
    enabled = true
  }

  # Enable point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "GHOST Shared Reports"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "SharedReports"
  }
}

# ============================================================================
# User Preferences Table (GovCloud Environment)
# ============================================================================
resource "aws_dynamodb_table" "user_preferences" {
  provider       = aws.target_deployment_account
  name           = "ghost-user-preferences"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  # Enable encryption at rest
  server_side_encryption {
    enabled = true
  }

  # Enable point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "GHOST User Preferences"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "UserPreferences"
  }
}

# ============================================================================
# Admin Notifications Table (GovCloud Environment)
# ============================================================================
# Tracks all admin notifications sent (feedback, errors, alerts, etc.)
# for audit trail and notification history viewing
resource "aws_dynamodb_table" "admin_notifications" {
  provider       = aws.target_deployment_account
  name           = "ghost_admin_notifications"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  range_key      = "timestamp"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "type"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  # GSI for querying notifications by type
  global_secondary_index {
    name            = "type-timestamp-index"
    hash_key        = "type"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # GSI for querying notifications by status
  global_secondary_index {
    name            = "status-timestamp-index"
    hash_key        = "status"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # Enable TTL to auto-delete old notifications (180 days)
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # Enable encryption at rest
  server_side_encryption {
    enabled = true
  }

  # Enable point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "GHOST Admin Notifications"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "AdminNotifications"
  }
}

# ============================================================================
# Outputs
# ============================================================================

output "api_keys_table_name" {
  description = "Name of the DynamoDB table for API keys"
  value       = aws_dynamodb_table.api_keys.name
}

output "api_keys_table_arn" {
  description = "ARN of the DynamoDB table for API keys"
  value       = aws_dynamodb_table.api_keys.arn
}

output "api_keys_usage_table_name" {
  description = "Name of the DynamoDB table for API keys usage"
  value       = aws_dynamodb_table.api_keys_usage.name
}

output "api_keys_usage_table_arn" {
  description = "ARN of the DynamoDB table for API keys usage"
  value       = aws_dynamodb_table.api_keys_usage.arn
}

output "shortlinks_table_name" {
  description = "Name of the DynamoDB table for shortlinks"
  value       = aws_dynamodb_table.shortlinks.name
}

output "shortlinks_table_arn" {
  description = "ARN of the DynamoDB table for shortlinks"
  value       = aws_dynamodb_table.shortlinks.arn
}

output "shared_reports_table_name" {
  description = "Name of the DynamoDB table for shared reports"
  value       = aws_dynamodb_table.shared_reports.name
}

output "shared_reports_table_arn" {
  description = "ARN of the DynamoDB table for shared reports"
  value       = aws_dynamodb_table.shared_reports.arn
}

output "user_preferences_table_name" {
  description = "Name of the DynamoDB table for user preferences"
  value       = aws_dynamodb_table.user_preferences.name
}

output "user_preferences_table_arn" {
  description = "ARN of the DynamoDB table for user preferences"
  value       = aws_dynamodb_table.user_preferences.arn
}

output "admin_notifications_table_name" {
  description = "Name of the DynamoDB table for admin notifications"
  value       = aws_dynamodb_table.admin_notifications.name
}

output "admin_notifications_table_arn" {
  description = "ARN of the DynamoDB table for admin notifications"
  value       = aws_dynamodb_table.admin_notifications.arn
}
