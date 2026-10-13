# Deployment-local OAuth & Applications administration projections.
#
# This table is intentionally ISOLATED from the provider artifact table
# (`aws_dynamodb_table.oauth_artifacts` / `GHOST_OAUTH_TABLE_NAME`). It holds
# only allowlisted, redacted projections and durable administrative records
# (inventory, events/activity, grants, issues, operations, diagnostic jobs,
# audit, alerts, and resumable maintenance checkpoints). It never copies
# credential artifacts (authorization codes, access/refresh/registration
# tokens, cookie values) from the provider table.
#
# Single-table design following the spec's "DynamoDB record layout and
# retention" access patterns. All partition/sort keys are opaque composite
# strings scoped to a server-resolved deployment (`ENV#<deployment>#...`); a
# caller can never select another deployment's partition. Sparse GSIs back the
# application/time, user/time, attempt/correlation/diagnostic, and issue
# membership lookups. Only the items participating in a given access pattern
# populate that GSI's key attributes, keeping each index sparse.
#
# Retention: activity/audit rows carry a 90-day logical expiry enforced by the
# repository BEFORE returning results; the DynamoDB `ttl` attribute is only
# asynchronous physical cleanup. Active inventory, managed policy, live grants,
# revocation markers, and incomplete operations do not carry a TTL and persist
# according to provider/enforcement state rather than the activity window.

resource "aws_dynamodb_table" "oauth_administration" {
  provider     = aws.target_deployment_account
  name         = "ghost-oauth-administration-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  # Base composite key. Examples:
  #   PK=ENV#<deployment>#APPLICATIONS            SK=CLIENT#<clientId>
  #   PK=ENV#<deployment>#<kind>#DAY#<YYYY-MM-DD> SK=<timestamp>#<id>
  #   PK=ENV#<deployment>#<kind>                  SK=<id>
  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # GSI1 — application/time or user/time streams. Only populated on items that
  # link to a client or subject, e.g.
  #   GSI1PK=ENV#<deployment>#CLIENT#<id>#<kind>
  #   GSI1PK=ENV#<deployment>#SUBJECT#<id>#<kind>
  # GSI1SK=<timestamp>#<id>
  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  # GSI2 — attempt/correlation/diagnostic references. Only populated when a
  # supported correlation/diagnostic reference exists, e.g.
  #   GSI2PK=ENV#<deployment>#REF#<kind>#<reference>
  # GSI2SK=<timestamp>#<id>
  attribute {
    name = "GSI2PK"
    type = "S"
  }

  attribute {
    name = "GSI2SK"
    type = "S"
  }

  # GSI3 — issue membership. Only populated on events grouped into an issue:
  #   GSI3PK=ENV#<deployment>#ISSUE#<issueId>
  # GSI3SK=<timestamp>#<id>
  attribute {
    name = "GSI3PK"
    type = "S"
  }

  attribute {
    name = "GSI3SK"
    type = "S"
  }

  global_secondary_index {
    name            = "ClientSubjectTimeIndex"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "ReferenceIndex"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "IssueMembershipIndex"
    hash_key        = "GSI3PK"
    range_key       = "GSI3SK"
    projection_type = "ALL"
  }

  # Physical cleanup only. Logical 90-day expiry is enforced in the repository
  # before rows are returned; active/enforcement records omit this attribute.
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
    Component   = "oauth-administration"
  }
}

# Least-privilege access for the ECS task role. Item-level CRUD plus Query on
# the table and its indexes only — no Scan on this table from request paths,
# and no access to the provider artifact table is granted here.
resource "aws_iam_policy" "ecs_oauth_administration" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_oauth_administration"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "OAuthAdministrationProjections"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.oauth_administration.arn,
          "${aws_dynamodb_table.oauth_administration.arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_oauth_administration" {
  provider   = aws.target_deployment_account
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = aws_iam_policy.ecs_oauth_administration.arn
}

output "oauth_administration_table_name" {
  description = "DynamoDB table holding deployment-local OAuth administration projections and audit records"
  value       = aws_dynamodb_table.oauth_administration.name
}
