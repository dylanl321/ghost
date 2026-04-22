# ============================================================================
# DynamoDB Tables Configuration
# ============================================================================
# This file defines DynamoDB tables for API keys, usage tracking, and shortlinks
# Note: Scheduled reports tables are in scheduled-reports.tf

# ============================================================================
# API Keys Table (Commercial Environment)
# ============================================================================
resource "aws_dynamodb_table" "api_keys" {
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-api-keys-prod" : "ghost-api-keys"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

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
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-api-keys-usage-prod" : "ghost-api-keys-usage"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "keyId"
  range_key    = "timestamp"

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
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-dashboard-shortlinks-prod" : "ghost-dashboard-shortlinks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "shortCode"

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
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-shared-reports-prod" : "ghost-shared-reports"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "shareId"

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
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-user-preferences-prod" : "ghost-user-preferences"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

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
# Site Configuration Table (GovCloud Environment)
# ============================================================================
# Stores feature flags and site-wide configuration
# Allows runtime configuration changes without code deployment
resource "aws_dynamodb_table" "site_config" {
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-site-config-prod" : "ghost-site-config"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "key"

  attribute {
    name = "key"
    type = "S"
  }

  attribute {
    name = "category"
    type = "S"
  }

  # GSI for querying config by category
  global_secondary_index {
    name            = "CategoryIndex"
    hash_key        = "category"
    projection_type = "ALL"
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
    Name        = "GHOST Site Configuration"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "SiteConfiguration"
  }
}

# ============================================================================
# Admin Notifications Table (GovCloud Environment)
# ============================================================================
# Tracks all admin notifications sent (feedback, errors, alerts, etc.)
# for audit trail and notification history viewing
resource "aws_dynamodb_table" "admin_notifications" {
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-admin-notifications-prod" : "ghost_admin_notifications"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"
  range_key    = "timestamp"

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
# Chat Threads Table (GovCloud Environment)
# ============================================================================
# Stores user chat conversations with the Strands AI assistant
# Supports multiple threads per user, sharing, and export
resource "aws_dynamodb_table" "chat_threads" {
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-chat-threads-prod" : "ghost-chat-threads"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "threadId"
  range_key    = "createdAt"

  attribute {
    name = "threadId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "lastMessageAt"
    type = "S"
  }

  attribute {
    name = "shareId"
    type = "S"
  }

  # GSI for querying threads by user (sorted by recent activity)
  global_secondary_index {
    name            = "UserIdIndex"
    hash_key        = "userId"
    range_key       = "lastMessageAt"
    projection_type = "ALL"
  }

  # GSI for accessing shared threads (public links)
  global_secondary_index {
    name            = "ShareIdIndex"
    hash_key        = "shareId"
    projection_type = "ALL"
  }

  # Enable TTL to auto-delete old threads (90 days default, configurable)
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
    Name        = "GHOST Chat Threads"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "ChatThreads"
  }
}

# ============================================================================
# Async Chat Jobs Table (GovCloud Environment)
# ============================================================================
# Stores async polling job status for Strands AI chat queries
# Jobs expire after 24 hours via TTL
resource "aws_dynamodb_table" "async_chat_jobs" {
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-async-chat-jobs-prod" : "ghost-async-chat-jobs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "jobId"

  attribute {
    name = "jobId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  # GSI for querying jobs by user
  global_secondary_index {
    name            = "UserIdIndex"
    hash_key        = "userId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  # GSI for querying jobs by status
  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "status"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  # Enable TTL to auto-delete old jobs (24 hours)
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
    Name        = "GHOST Async Chat Jobs"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "AsyncChatJobs"
  }
}

# ============================================================================
# Async Chat Metrics Table (GovCloud Environment)
# ============================================================================
# Stores async polling chat metrics for monitoring and analytics
# Tracks performance, usage, and errors with 90-day retention
resource "aws_dynamodb_table" "async_metrics" {
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-async-metrics-prod" : "ghost-async-metrics"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "metricDate"
  range_key    = "metricType"

  attribute {
    name = "metricDate"
    type = "S"
  }

  attribute {
    name = "metricType"
    type = "S"
  }

  # Enable TTL to auto-delete old metrics (90 days)
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
    Name        = "GHOST Async Chat Metrics"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "AsyncMetrics"
  }
}

# ============================================================================
# Strands Agent Metrics Table (GovCloud Environment)
# ============================================================================
# NOTE: This table is OWNED and MANAGED by the Strands team's Terraform
#
# Table name: strands-agent-metrics-{environment}
# Example: strands-agent-metrics-dev, strands-agent-metrics-prod
#
# GHOST only READS from this table via API endpoints in:
#   - /server/api/admin/strands-agent/dashboard.get.ts
#   - /server/api/admin/strands-agent/session-trace.get.ts
#   - /server/api/admin/strands-agent/account-metrics.get.ts
#
# The Strands team's implementation details:
#   - File: strands_metrics_integration.md
#   - Their Terraform: terraform/dynamodb.tf (in Strands repo)
#   - Python metrics service: agent/services/metrics_service.py
#
# DO NOT uncomment this resource - it will conflict with the Strands team's
# Terraform state. GHOST only needs read-only IAM permissions to query the table.

# ============================================================================
# Cost Tag Configuration Table (GovCloud Environment)
# ============================================================================
# Stores per-account cost tag configuration (important tags, descriptions, aliases)
# Migrated from costTagConfig attribute on gdms_aws_accounts-master table
resource "aws_dynamodb_table" "cost_tag_config" {
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-cost-tag-config-prod" : "ghost-cost-tag-config"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "accountId"

  attribute {
    name = "accountId"
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
    Name        = "GHOST Cost Tag Configuration"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "CostTagConfig"
  }
}

# ============================================================================
# User Notifications Table (GovCloud Environment)
# ============================================================================
# Per-user notification inbox for the unified notification system
# Supports in-browser notification center, email routing, and digest delivery
resource "aws_dynamodb_table" "user_notifications" {
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-user-notifications-prod" : "ghost-user-notifications"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "notificationId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "notificationId"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  attribute {
    name = "category"
    type = "S"
  }

  attribute {
    name = "emailPending"
    type = "S"
  }

  # GSI for querying unread notifications per user
  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "userId"
    range_key       = "status"
    projection_type = "ALL"
  }

  # GSI for filtering by category per user
  global_secondary_index {
    name            = "CategoryIndex"
    hash_key        = "userId"
    range_key       = "category"
    projection_type = "ALL"
  }

  # Sparse GSI for digest email processing — only items with emailPending="PENDING" appear
  global_secondary_index {
    name            = "EmailPendingIndex"
    hash_key        = "emailPending"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  # Enable TTL to auto-delete old notifications (90 days)
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
    Name        = "GHOST User Notifications"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "UserNotifications"
  }
}

# ============================================================================
# Notification Broadcasts Table (GovCloud Environment)
# ============================================================================
# Tracks admin broadcast notifications sent to users
resource "aws_dynamodb_table" "notification_broadcasts" {
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-notification-broadcasts-prod" : "ghost-notification-broadcasts"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "broadcastId"

  attribute {
    name = "broadcastId"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  # GSI for finding scheduled/pending broadcasts
  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "status"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  # Enable TTL to auto-delete old broadcasts (90 days)
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
    Name        = "GHOST Notification Broadcasts"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "NotificationBroadcasts"
  }
}

# ============================================================================
# Achievement Progress Table (GovCloud Environment)
# ============================================================================
# Stores per-user achievement/badge progress for the gamification system
# Single-item-per-user pattern: userId → all badge progress data
resource "aws_dynamodb_table" "achievement_progress" {
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-achievement-progress-prod" : "ghost-achievement-progress"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

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
    Name        = "GHOST Achievement Progress"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "AchievementProgress"
  }
}

# ============================================================================
# Utilization Analysis Table (GovCloud Environment)
# ============================================================================
# Stores background utilization analysis jobs and per-instance classification results
# Single-table design: PK/SK pattern for jobs, latest pointers, and instance results
resource "aws_dynamodb_table" "utilization_analysis" {
  provider     = aws.target_deployment_account
  name         = var.env == "prod" ? "ghost-utilization-analysis-prod" : "ghost-utilization-analysis"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # Enable TTL to auto-delete old analysis results (30 days)
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
    Name        = "GHOST Utilization Analysis"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "UtilizationAnalysis"
  }
}

# ============================================================================
# Outputs
# ============================================================================

output "user_notifications_table_name" {
  description = "Name of the DynamoDB table for user notifications"
  value       = aws_dynamodb_table.user_notifications.name
}

output "user_notifications_table_arn" {
  description = "ARN of the DynamoDB table for user notifications"
  value       = aws_dynamodb_table.user_notifications.arn
}

output "notification_broadcasts_table_name" {
  description = "Name of the DynamoDB table for notification broadcasts"
  value       = aws_dynamodb_table.notification_broadcasts.name
}

output "notification_broadcasts_table_arn" {
  description = "ARN of the DynamoDB table for notification broadcasts"
  value       = aws_dynamodb_table.notification_broadcasts.arn
}

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

output "site_config_table_name" {
  description = "Name of the DynamoDB table for site configuration"
  value       = aws_dynamodb_table.site_config.name
}

output "site_config_table_arn" {
  description = "ARN of the DynamoDB table for site configuration"
  value       = aws_dynamodb_table.site_config.arn
}

output "chat_threads_table_name" {
  description = "Name of the DynamoDB table for chat threads"
  value       = aws_dynamodb_table.chat_threads.name
}

output "chat_threads_table_arn" {
  description = "ARN of the DynamoDB table for chat threads"
  value       = aws_dynamodb_table.chat_threads.arn
}

output "async_chat_jobs_table_name" {
  description = "Name of the DynamoDB table for async chat jobs"
  value       = aws_dynamodb_table.async_chat_jobs.name
}

output "async_chat_jobs_table_arn" {
  description = "ARN of the DynamoDB table for async chat jobs"
  value       = aws_dynamodb_table.async_chat_jobs.arn
}

output "async_metrics_table_name" {
  description = "Name of the DynamoDB table for async metrics"
  value       = aws_dynamodb_table.async_metrics.name
}

output "async_metrics_table_arn" {
  description = "ARN of the DynamoDB table for async metrics"
  value       = aws_dynamodb_table.async_metrics.arn
}

output "cost_tag_config_table_name" {
  description = "Name of the DynamoDB table for cost tag configuration"
  value       = aws_dynamodb_table.cost_tag_config.name
}

output "cost_tag_config_table_arn" {
  description = "ARN of the DynamoDB table for cost tag configuration"
  value       = aws_dynamodb_table.cost_tag_config.arn
}

output "achievement_progress_table_name" {
  description = "Name of the DynamoDB table for achievement progress"
  value       = aws_dynamodb_table.achievement_progress.name
}

output "achievement_progress_table_arn" {
  description = "ARN of the DynamoDB table for achievement progress"
  value       = aws_dynamodb_table.achievement_progress.arn
}

output "utilization_analysis_table_name" {
  description = "Name of the DynamoDB table for utilization analysis"
  value       = aws_dynamodb_table.utilization_analysis.name
}

output "utilization_analysis_table_arn" {
  description = "ARN of the DynamoDB table for utilization analysis"
  value       = aws_dynamodb_table.utilization_analysis.arn
}

# NOTE: strands_agent_metrics table outputs removed
# That table is managed by the Strands team's Terraform, not GHOST
# GHOST only needs read-only access to query it via API endpoints
