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
        Sid      = "AllowSecretsManager"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = [
          "arn:${local.child_partition}:secretsmanager:${local.child_region}:${local.child_account_id}:secret:ghost*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_attachment" {
  provider  = aws.target_deployment_account
  role      = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws-us-gov:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_step_fuction_permission" {
  provider  = aws.target_deployment_account
  role      = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:${local.child_partition}:iam::aws:policy/AWSStepFunctionsFullAccess"
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_dynamodb_read_only" {
  provider  = aws.target_deployment_account
  role      = aws_iam_role.ecs_task_execution_role.name
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
          "arn:${local.child_partition}:dynamodb:${local.child_region}:${local.child_account_id}:table/ghost-report-executions"
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
            "ses:FromAddress" = "noreply@${var.domain_name}"
          }
        }
      },
      {
        Sid    = "SESConfigurationSet"
        Effect = "Allow"
        Action = [
          "ses:PutConfigurationSetDeliveryOptions"
        ]
        Resource = "arn:${local.child_partition}:ses:${local.child_region}:${local.child_account_id}:configuration-set/ghost-scheduled-reports"
      }
    ]
  })
}

# SNS permissions for SES notifications
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
        Resource = "arn:${local.child_partition}:sns:${local.child_region}:${local.child_account_id}:ghost-ses-notifications"
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

# DynamoDB permissions for external accounts table (read-only access to gdms_aws_accounts-master)
# Note: This table is managed externally and located in the same GovCloud account
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
