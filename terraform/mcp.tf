# Durable OAuth state for oidc-provider. The GSIs implement its secondary
# lookups without coupling MCP authentication to one ECS task.
resource "aws_kms_key" "mcp_secrets" {
  provider                = aws.target_deployment_account
  description             = "Application-level encryption for delegated Graph and Identity Center MCP tokens"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Application = var.app_name
    Environment = var.env
    Component   = "mcp-secret-encryption"
  }
}

resource "aws_kms_alias" "mcp_secrets" {
  provider      = aws.target_deployment_account
  name          = "alias/${var.app_name}-mcp-secrets"
  target_key_id = aws_kms_key.mcp_secrets.key_id
}

resource "aws_dynamodb_table" "oauth_artifacts" {
  provider     = aws.target_deployment_account
  name         = "ghost-oauth-artifacts-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "artifactId"

  attribute {
    name = "artifactId"
    type = "S"
  }

  attribute {
    name = "grantId"
    type = "S"
  }

  attribute {
    name = "uid"
    type = "S"
  }

  attribute {
    name = "userCode"
    type = "S"
  }

  global_secondary_index {
    name            = "GrantIdIndex"
    hash_key        = "grantId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "UidIndex"
    hash_key        = "uid"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "UserCodeIndex"
    hash_key        = "userCode"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Application = var.app_name
    Environment = var.env
    Component   = "mcp-oauth"
  }
}

resource "aws_dynamodb_table" "mcp_audit" {
  provider     = aws.target_deployment_account
  name         = "ghost-mcp-audit-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "eventId"

  attribute {
    name = "eventId"
    type = "S"
  }

  attribute {
    name = "subject"
    type = "S"
  }

  attribute {
    name = "tool"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "eventDate"
    type = "S"
  }

  global_secondary_index {
    name            = "SubjectTimestampIndex"
    hash_key        = "subject"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "EventDateIndex"
    hash_key        = "eventDate"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "ToolTimestampIndex"
    hash_key        = "tool"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Application = var.app_name
    Environment = var.env
    Component   = "mcp-audit"
  }
}

resource "aws_dynamodb_table" "mcp_evidence" {
  provider     = aws.target_deployment_account
  name         = "ghost-mcp-evidence-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "bundleId"

  attribute {
    name = "bundleId"
    type = "S"
  }

  attribute {
    name = "ownerSubject"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "OwnerCreatedAtIndex"
    hash_key        = "ownerSubject"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "mcp_usage_daily" {
  provider     = aws.target_deployment_account
  name         = "ghost-mcp-usage-daily-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_iam_policy" "ecs_mcp_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_mcp_dynamodb"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "McpOAuthArtifacts"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.oauth_artifacts.arn,
          "${aws_dynamodb_table.oauth_artifacts.arn}/index/*"
        ]
      },
      {
        Sid      = "McpAuditReadWrite"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:Scan"]
        Resource = [aws_dynamodb_table.mcp_audit.arn, "${aws_dynamodb_table.mcp_audit.arn}/index/*"]
      },
      {
        Sid      = "McpEvidence"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Query"]
        Resource = [aws_dynamodb_table.mcp_evidence.arn, "${aws_dynamodb_table.mcp_evidence.arn}/index/*"]
      },
      {
        Sid      = "McpUsageDaily"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"]
        Resource = aws_dynamodb_table.mcp_usage_daily.arn
      },
      {
        Sid      = "McpSecretEncryption"
        Effect   = "Allow"
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource = aws_kms_key.mcp_secrets.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_mcp_dynamodb" {
  provider   = aws.target_deployment_account
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = aws_iam_policy.ecs_mcp_dynamodb.arn
}

output "oauth_artifacts_table_name" {
  description = "DynamoDB table used by the GHOST OAuth authorization server"
  value       = aws_dynamodb_table.oauth_artifacts.name
}

output "mcp_audit_table_name" {
  description = "DynamoDB table containing redacted MCP tool audit events"
  value       = aws_dynamodb_table.mcp_audit.name
}

output "mcp_secret_kms_key_arn" {
  description = "KMS key used for application-level encryption of delegated MCP tokens"
  value       = aws_kms_key.mcp_secrets.arn
}

output "mcp_evidence_table_name" { value = aws_dynamodb_table.mcp_evidence.name }
output "mcp_usage_daily_table_name" { value = aws_dynamodb_table.mcp_usage_daily.name }
