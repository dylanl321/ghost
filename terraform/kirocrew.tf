# Versioned Kiro Crew configuration owned by GHOST. Revisions are immutable
# snapshots; the CURRENT item is advanced conditionally by the application.
resource "aws_kms_key" "kirocrew_config" {
  provider                = aws.target_deployment_account
  description             = "Encryption for GHOST Kiro Crew configuration and secrets"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Application = var.app_name
    Environment = var.env
    Component   = "kirocrew-config"
  }
}

resource "aws_kms_alias" "kirocrew_config" {
  provider      = aws.target_deployment_account
  name          = "alias/${var.app_name}-kirocrew-config"
  target_key_id = aws_kms_key.kirocrew_config.key_id
}

resource "aws_dynamodb_table" "kirocrew_config" {
  provider     = aws.target_deployment_account
  name         = "ghost-kirocrew-config-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "profileId"
  range_key    = "recordId"

  attribute {
    name = "profileId"
    type = "S"
  }

  attribute {
    name = "recordId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.kirocrew_config.arn
  }

  tags = {
    Application = var.app_name
    Environment = var.env
    Component   = "kirocrew-config"
  }
}

resource "aws_iam_role_policy" "ecs_kirocrew_config" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_kirocrew_config"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "KiroCrewConfigDynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:TransactWriteItems"
        ]
        Resource = aws_dynamodb_table.kirocrew_config.arn
      },
      {
        Sid    = "KiroCrewConfigKms"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = aws_kms_key.kirocrew_config.arn
      }
    ]
  })
}
