resource "aws_iam_role" "ecs_task_execution_role" {
  provider = aws.target_deployment_account
  name     = "ECS-Task-${var.app_name}-Role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecs_task_execution_role_policy" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_secrets_policy"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSecretsManager"
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = [
          "arn:${local.child_partition}:secretsmanager:${local.child_region}:${local.child_account_id}:secret:ghost*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_attachment" {
  provider   = aws.target_deployment_account
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws-us-gov:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_step_fuction_permission" {
  provider   = aws.target_deployment_account
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:${local.child_partition}:iam::aws:policy/AWSStepFunctionsFullAccess"
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_dynamodb_read_only" {
  provider   = aws.target_deployment_account
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:${local.child_partition}:iam::aws:policy/AmazonDynamoDBReadOnlyAccess"
}

# DynamoDB permissions for scheduled reports (read/write)
resource "aws_iam_role_policy" "ecs_scheduled_reports_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_scheduled_reports_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ScheduledReportsDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-scheduled-reports",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-scheduled-reports/index/*",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-email-templates",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-email-templates/index/*",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-report-executions",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-shared-reports",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-shared-reports/index/*"
        ]
      }
    ]
  })
}

# SES permissions for sending emails
resource "aws_iam_role_policy" "ecs_ses_send_email" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_ses_send_email"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SESSendEmail"
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "ses:FromAddress" = "aws-ghost@gd-ms.com"
          }
        }
      },
      {
        Sid    = "SESConfigurationSet"
        Effect = "Allow"
        Action = [
          "ses:PutConfigurationSetDeliveryOptions"
        ]
        Resource = "arn:${local.child_partition}:ses:${local.child_region}:${local.child_account_id}:configuration-set/ghost-scheduled-reports-${var.env}"
      }
    ]
  })
}

# SNS permissions for SES notifications (cross-account to Account A)
resource "aws_iam_role_policy" "ecs_sns_ses_notifications" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_sns_ses_notifications"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SNSPublishSESNotifications"
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = "arn:${local.org_partition}:sns:${local.org_region}:${local.org_account_id}:ghost-ses-notifications-${var.env}"
      }
    ]
  })
}

# DynamoDB permissions for API keys (read/write)
resource "aws_iam_role_policy" "ecs_api_keys_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_api_keys_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "APIKeysDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-api-keys",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-api-keys/index/*",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-api-keys-usage",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-api-keys-usage/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for shortlinks (read/write)
resource "aws_iam_role_policy" "ecs_shortlinks_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_shortlinks_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ShortlinksDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-dashboard-shortlinks",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-dashboard-shortlinks/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for admin notifications (read/write)
resource "aws_iam_role_policy" "ecs_admin_notifications_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_admin_notifications_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AdminNotificationsDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost_admin_notifications",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost_admin_notifications/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for site configuration (read/write)
resource "aws_iam_role_policy" "ecs_site_config_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_site_config_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SiteConfigDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-site-config",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-site-config/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for chat threads (read/write)
resource "aws_iam_role_policy" "ecs_chat_threads_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_chat_threads_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ChatThreadsDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:TransactWriteItems"
        ]
        Resource = [
          aws_dynamodb_table.chat_threads.arn,
          "${aws_dynamodb_table.chat_threads.arn}/index/*",
          aws_dynamodb_table.chat_messages.arn,
          "${aws_dynamodb_table.chat_messages.arn}/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for streaming metrics (read/write)
resource "aws_iam_role_policy" "ecs_streaming_metrics_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_streaming_metrics_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "StreamingMetricsDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-streaming-metrics"
        ]
      }
    ]
  })
}

# S3 permissions for application storage (reports, exports, attachments)
resource "aws_iam_role_policy" "ecs_s3_app_storage" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_s3_app_storage"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3AppStorageAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:GetObjectAttributes",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:${local.child_partition}:s3:::ghost-app-storage-${var.env}/*",
          "arn:${local.child_partition}:s3:::ghost-app-storage-${var.env}"
        ]
      }
    ]
  })
}

# DynamoDB permissions for user preferences (read/write)
resource "aws_iam_role_policy" "ecs_user_preferences_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_user_preferences_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "UserPreferencesDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-user-preferences",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-user-preferences/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for account notes (read/write)
resource "aws_iam_role_policy" "ecs_account_notes_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_account_notes_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AccountNotesDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-account-notes",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-account-notes/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for manual plan values (read/write)
resource "aws_iam_role_policy" "ecs_manual_plan_values_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_manual_plan_values_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManualPlanValuesDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-manual-plan-values",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-manual-plan-values/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for async chat jobs (read/write)
resource "aws_iam_role_policy" "ecs_async_chat_jobs_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_async_chat_jobs_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AsyncChatJobsDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:TransactWriteItems"
        ]
        Resource = [
          aws_dynamodb_table.async_chat_jobs.arn,
          "${aws_dynamodb_table.async_chat_jobs.arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecs_chat_jobs_sqs" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_chat_jobs_sqs"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:ChangeMessageVisibility",
        "sqs:GetQueueAttributes"
      ]
      Resource = [aws_sqs_queue.chat_jobs.arn, aws_sqs_queue.chat_jobs_dlq.arn]
    }]
  })
}

# DynamoDB permissions for async metrics (read/write)
resource "aws_iam_role_policy" "ecs_async_metrics_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_async_metrics_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AsyncMetricsDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-async-metrics",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-async-metrics/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for cost tag config (read/write)
resource "aws_iam_role_policy" "ecs_cost_tag_config_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_cost_tag_config_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CostTagConfigDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-cost-tag-config",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-cost-tag-config/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for user notifications (read/write)
resource "aws_iam_role_policy" "ecs_user_notifications_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_user_notifications_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "UserNotificationsDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-user-notifications",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-user-notifications/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for notification broadcasts (read/write)
resource "aws_iam_role_policy" "ecs_notification_broadcasts_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_notification_broadcasts_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "NotificationBroadcastsDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-notification-broadcasts",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-notification-broadcasts/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for achievement progress (read/write)
resource "aws_iam_role_policy" "ecs_achievement_progress_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_achievement_progress_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AchievementProgressDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-achievement-progress",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-achievement-progress/index/*"
        ]
      }
    ]
  })
}

# DynamoDB permissions for external accounts table (read-only access to gdms_aws_accounts-master)
# Note: This table is managed externally and located in the same GovCloud account
# DynamoDB permissions for utilization analysis (read/write)
resource "aws_iam_role_policy" "ecs_utilization_analysis_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_utilization_analysis_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "UtilizationAnalysisDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-utilization-analysis",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-utilization-analysis/index/*",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-utilization-analysis-prod",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-utilization-analysis-prod/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecs_external_accounts_table" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_external_accounts_table"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ExternalAccountsTableRead"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem"
        ]
        Resource = [
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/gdms_aws_accounts-master",
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/gdms_aws_accounts-master/index/*"
        ]
      }
    ]
  })
}
