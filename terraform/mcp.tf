# Durable OAuth state for oidc-provider. The GSIs implement its secondary
# lookups without coupling MCP authentication to one ECS task.
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

  global_secondary_index {
    name            = "SubjectTimestampIndex"
    hash_key        = "subject"
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

resource "aws_iam_role_policy" "ecs_mcp_dynamodb" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_mcp_dynamodb"
  role     = aws_iam_role.ecs_task_execution_role.name

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
        Sid      = "McpAuditWrite"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem"]
        Resource = aws_dynamodb_table.mcp_audit.arn
      }
    ]
  })
}

output "oauth_artifacts_table_name" {
  description = "DynamoDB table used by the GHOST OAuth authorization server"
  value       = aws_dynamodb_table.oauth_artifacts.name
}

output "mcp_audit_table_name" {
  description = "DynamoDB table containing redacted MCP tool audit events"
  value       = aws_dynamodb_table.mcp_audit.name
}

