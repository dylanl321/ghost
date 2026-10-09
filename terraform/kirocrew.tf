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

# Installer_Payload artifact bytes. Objects are written write-once per revision
# by the registry-repo publish job (scoped S3 write) BEFORE that revision is
# advertised via the CURRENT pointer, so a served /v1/payload/<revision> is never
# pointed at missing bytes. Ghost only ever READS these objects to stream them at
# GET /v1/payload/<revision>. Revisions are monotonic, so the revision-addressed
# keys (kirocrew/payload/<revision>.tar) never collide or overwrite, which gives
# free retention for rollback/audit (Requirement 23.1). The artifact is code and
# app definitions only, never product binaries, model weights, or secrets.
resource "aws_s3_bucket" "kirocrew_payload" {
  provider = aws.target_deployment_account
  bucket   = "ghost-kirocrew-payload-${var.env}"

  tags = {
    Name        = "GHOST Kiro Crew Installer Payload"
    Application = var.app_name
    Environment = var.env
    Component   = "kirocrew-payload"
    ManagedBy   = "Terraform"
  }
}

# Versioning as defense-in-depth: even if a key were somehow rewritten, prior
# bytes are retained. The publish job still treats each revision key as
# write-once; monotonic revisions mean keys are not reused in normal operation.
resource "aws_s3_bucket_versioning" "kirocrew_payload" {
  provider = aws.target_deployment_account
  bucket   = aws_s3_bucket.kirocrew_payload.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Reject public writes and enforce write-once semantics for the payload prefix:
# a PutObject succeeds only when no object exists at the revision key. The publish
# job sets If-None-Match: * on upload; this policy denies overwriting an existing
# revision key so a revision's bytes can never be silently replaced.
resource "aws_s3_bucket_policy" "kirocrew_payload_write_once" {
  provider = aws.target_deployment_account
  bucket   = aws_s3_bucket.kirocrew_payload.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.kirocrew_payload.arn,
          "${aws_s3_bucket.kirocrew_payload.arn}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "kirocrew_payload" {
  provider = aws.target_deployment_account
  bucket   = aws_s3_bucket.kirocrew_payload.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.kirocrew_config.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "kirocrew_payload" {
  provider = aws.target_deployment_account
  bucket   = aws_s3_bucket.kirocrew_payload.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_iam_policy" "ecs_kirocrew_config" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_kirocrew_config"

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
      },
      {
        # Ghost only READS payload objects to stream them at
        # GET /v1/payload/<revision>. It never uploads them; the registry-repo
        # publish job holds the scoped write credential. HeadObject backs the
        # size-cap check before the body is read.
        Sid    = "KiroCrewPayloadRead"
        Effect = "Allow"
        Action = [
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.kirocrew_payload.arn}/kirocrew/payload/*"
      },
      {
        Sid    = "KiroCrewPayloadList"
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.kirocrew_payload.arn
        Condition = {
          StringLike = { "s3:prefix" = "kirocrew/payload/*" }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_kirocrew_config" {
  provider   = aws.target_deployment_account
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = aws_iam_policy.ecs_kirocrew_config.arn
}
