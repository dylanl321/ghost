# SES Email Identity (From Address)
# Using existing verified identity: GDMSCloud.AWS@gd-ms.com
# This identity is already set up in the AWS account
locals {
  ses_from_email = "GDMSCloud.AWS@gd-ms.com"
}

# SES Configuration Set for tracking
resource "aws_ses_configuration_set" "ghost_reports" {
  provider = aws.target_deployment_account
  name     = "ghost-scheduled-reports"

  delivery_options {
    tls_policy = "Require"
  }
}

# SNS Topic for SES Bounce/Complaint notifications
resource "aws_sns_topic" "ses_notifications" {
  provider = aws.target_deployment_account
  name     = "ghost-ses-notifications"

  tags = {
    Name        = "GHOST SES Notifications"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
  }
}

# Subscribe SES events to SNS topic
resource "aws_ses_identity_notification_topic" "bounces" {
  provider                 = aws.target_deployment_account
  topic_arn                = aws_sns_topic.ses_notifications.arn
  notification_type        = "Bounce"
  identity                 = local.ses_from_email
  include_original_headers = false
}

resource "aws_ses_identity_notification_topic" "complaints" {
  provider                 = aws.target_deployment_account
  topic_arn                = aws_sns_topic.ses_notifications.arn
  notification_type        = "Complaint"
  identity                 = local.ses_from_email
  include_original_headers = false
}

# CloudWatch Event Rule for email delivery tracking
resource "aws_cloudwatch_event_rule" "ses_delivery_events" {
  provider    = aws.target_deployment_account
  name        = "ghost-ses-delivery-tracking"
  description = "Track SES email delivery events"

  event_pattern = jsonencode({
    source      = ["aws.ses"]
    detail-type = ["SES Email Sending Event"]
  })

  tags = {
    Name        = "GHOST SES Delivery Tracking"
    Environment = local.environment
    ManagedBy   = "Terraform"
  }
}

# Output SES configuration details
output "ses_from_email" {
  description = "SES from email address"
  value       = local.ses_from_email
}

output "ses_configuration_set" {
  description = "SES configuration set name"
  value       = aws_ses_configuration_set.ghost_reports.name
}

output "ses_notifications_topic_arn" {
  description = "ARN of SNS topic for SES notifications"
  value       = aws_sns_topic.ses_notifications.arn
}
