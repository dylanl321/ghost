# SES Email Identity (From Address)
# Using existing verified identity in Account A (org account)
# Account A has production SES and domain validation
locals {
  ses_from_email = "aws-ghost@gd-ms.com"
}

# SES Configuration Set for tracking (in Account A)
resource "aws_ses_configuration_set" "ghost_reports_org_account" {
  provider = aws.org_account
  name     = "ghost-scheduled-reports-${var.env}"

  delivery_options {
    tls_policy = "Require"
  }
}

# SNS Topic for SES Bounce/Complaint notifications (in Account A)
resource "aws_sns_topic" "ses_notifications_org_account" {
  provider = aws.org_account
  name     = "ghost-ses-notifications-${var.env}"

  tags = {
    Name        = "GHOST SES Notifications"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Account     = "Account A (Org)"
  }
}

# Subscribe SES events to SNS topic (in Account A)
resource "aws_ses_identity_notification_topic" "bounces" {
  provider                 = aws.org_account
  topic_arn                = aws_sns_topic.ses_notifications_org_account.arn
  notification_type        = "Bounce"
  identity                 = local.ses_from_email
  include_original_headers = false
}

resource "aws_ses_identity_notification_topic" "complaints" {
  provider                 = aws.org_account
  topic_arn                = aws_sns_topic.ses_notifications_org_account.arn
  notification_type        = "Complaint"
  identity                 = local.ses_from_email
  include_original_headers = false
}

# CloudWatch Event Rule for email delivery tracking (in Account A)
resource "aws_cloudwatch_event_rule" "ses_delivery_events_org_account" {
  provider    = aws.org_account
  name        = "ghost-ses-delivery-tracking-${var.env}"
  description = "Track SES email delivery events"

  event_pattern = jsonencode({
    source      = ["aws.ses"]
    detail-type = ["SES Email Sending Event"]
  })

  tags = {
    Name        = "GHOST SES Delivery Tracking"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Account     = "Account A (Org)"
  }
}

# Output SES configuration details
output "ses_from_email" {
  description = "SES from email address"
  value       = local.ses_from_email
}

output "ses_configuration_set" {
  description = "SES configuration set name"
  value       = aws_ses_configuration_set.ghost_reports_org_account.name
}

output "ses_notifications_topic_arn" {
  description = "ARN of SNS topic for SES notifications"
  value       = aws_sns_topic.ses_notifications_org_account.arn
}
