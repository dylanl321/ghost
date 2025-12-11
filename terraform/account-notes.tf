# ============================================================================
# Account Notes Table (GovCloud Environment)
# ============================================================================
# This table stores admin notes and comments for AWS accounts
# Supports tagging other admins and categorization

resource "aws_dynamodb_table" "account_notes" {
  provider     = aws.target_deployment_account
  name         = "ghost-account-notes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "noteId"

  attribute {
    name = "noteId"
    type = "S"
  }

  attribute {
    name = "accountId"
    type = "S"
  }

  attribute {
    name = "createdBy"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  # GSI for querying notes by account
  global_secondary_index {
    name            = "AccountIdIndex"
    hash_key        = "accountId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  # GSI for querying notes by creator
  global_secondary_index {
    name            = "CreatedByIndex"
    hash_key        = "createdBy"
    range_key       = "createdAt"
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
    Name        = "GHOST Account Notes"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
    Component   = "AccountNotes"
  }
}

# Output the table name for reference
output "account_notes_table_name" {
  description = "Name of the account notes DynamoDB table"
  value       = aws_dynamodb_table.account_notes.name
}


