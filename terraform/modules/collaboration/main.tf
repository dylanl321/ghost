# ============================================================================
# Shared Investigations — collaboration persistence (disabled-first)
# ============================================================================
# Ownership: Ghostv2 Terraform.
# Spec: .kiro/specs/shared-investigations/design.md "Deployment topology and
# rollout". Provisions the GHOST-side collaboration persistence layer BEFORE any
# Team_Space is enabled:
#
#   * one dedicated on-demand DynamoDB Cloud_Record_Store (KMS + PITR)   -- Req 7.1
#   * one dedicated private versioned S3 Object_Store (KMS/BPA/TLS-only) -- Req 8.1
#   * a dedicated customer-managed KMS key for both stores              -- Req 7.1, 8.1
#
# Least-privilege runtime roles live in iam.tf and independent lifecycle worker
# scheduling lives in scheduler.tf.
#
# Disabled-first: collaboration routes and pilot Team_Spaces stay disabled until
# compatible clients and pilot acceptance gates pass (Req 22.1, 24.24). The
# infrastructure is provisioned and idle; enablement is a published
# Organization_Profile decision, not an infrastructure decision.
#
# Legacy GHOST 90-day private-evidence expiration rules are deliberately NOT
# applied here: durable team history is retained until deliberate deletion
# (Req 20.1, 20.2), which is incompatible with expiring private-evidence
# contracts (Req 21.10).

terraform {
  required_version = ">= 1.9.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  tags = merge(var.tags, {
    Component = "Collaboration"
    # Disabled-first rollout marker. Flipping enablement is a published-profile
    # action; this records the infrastructure default, not runtime access.
    CollaborationEnabled = tostring(var.collaboration_enabled)
  })
}

# ----------------------------------------------------------------------------
# Dedicated customer-managed KMS key (Req 7.1, 8.1)
# ----------------------------------------------------------------------------
# One CMK encrypts both the Cloud_Record_Store (DynamoDB) and the Object_Store
# (S3). A dedicated key keeps collaboration cryptography independent of other
# GHOST data and lets the runtime roles be granted key use with least privilege.

data "aws_iam_policy_document" "kms" {
  # Account administration retains control of the key.
  statement {
    sid       = "EnableAccountKeyAdministration"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${var.partition}:iam::${var.account_id}:root"]
    }
  }

  # AWS services that hold data at rest may use the key on behalf of this
  # account only (via source-account condition), never cross-account.
  statement {
    sid    = "AllowServiceUseWithinAccount"
    effect = "Allow"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ]
    resources = ["*"]
    principals {
      type = "Service"
      identifiers = [
        "dynamodb.amazonaws.com",
        "s3.amazonaws.com",
      ]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

resource "aws_kms_key" "collaboration" {
  description             = "GHOST Shared Investigations collaboration record and artifact encryption."
  deletion_window_in_days = var.kms_deletion_window_days
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.kms.json

  tags = local.tags
}

resource "aws_kms_alias" "collaboration" {
  name          = "alias/${var.name}"
  target_key_id = aws_kms_key.collaboration.key_id
}

# ----------------------------------------------------------------------------
# Cloud_Record_Store: one dedicated on-demand DynamoDB table (Req 7.1)
# ----------------------------------------------------------------------------
# Single-table design. Every primary key embeds Tenant and Team_Space (Req 7.2).
# Strong direct reads and the Change_Feed are authoritative; GSIs support
# subject lookup and active/archived browsing without routine scans (Req 7.12).

resource "aws_dynamodb_table" "records" {
  name         = "${var.name}-records"
  billing_mode = "PAY_PER_REQUEST" # on-demand (Req 7.1)
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }

  # Subject lookup GSI keyed by a stable Subject_Reference (Req 7.12).
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI1SK"
    type = "S"
  }

  # Active/archived browsing GSI (Req 7.12).
  attribute {
    name = "GSI2PK"
    type = "S"
  }
  attribute {
    name = "GSI2SK"
    type = "S"
  }

  global_secondary_index {
    name            = "SubjectLookup"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "InvestigationBrowse"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }

  # Server-side TTL sweeps expired Presence_Leases. Queries still filter
  # expiresAt <= serverNow so correctness never depends on TTL timing.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  # Req 7.1: encryption with the dedicated collaboration CMK.
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.collaboration.arn
  }

  # Req 7.1: point-in-time recovery.
  point_in_time_recovery {
    enabled = true
  }

  # Durable team history: guard against accidental table destruction.
  deletion_protection_enabled = true

  tags = merge(local.tags, {
    Name = "GHOST Shared Investigations Records"
    Role = "cloud-record-store"
  })
}

# ----------------------------------------------------------------------------
# Object_Store: one dedicated private versioned S3 bucket (Req 8.1)
# ----------------------------------------------------------------------------

resource "aws_s3_bucket" "artifacts" {
  bucket = "${var.name}-artifacts-${var.account_id}"

  tags = merge(local.tags, {
    Name = "GHOST Shared Investigations Artifacts"
    Role = "object-store"
  })
}

# Req 8.1: versioning. Deletion enumerates and removes every version and delete
# marker under an Investigation prefix (Req 20.4).
resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Req 8.1: KMS encryption with the dedicated collaboration CMK.
resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.collaboration.arn
    }
    bucket_key_enabled = true
  }
}

# Req 8.1: block all public access.
resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Req 8.1: transport encryption enforcement (deny non-TLS) and deny any object
# write that is not KMS-encrypted.
data "aws_iam_policy_document" "artifacts_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid       = "DenyUnencryptedObjectUploads"
    effect    = "Deny"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["aws:kms"]
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  policy = data.aws_iam_policy_document.artifacts_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.artifacts]
}

# Lifecycle: abandoned-upload hygiene ONLY.
#
# Req 8.11 / 20.12: incomplete multipart uploads are aborted after 7 days as
# storage hygiene. This is intentionally NOT a content-expiration rule.
#
# The legacy GHOST 90-day private-evidence expiration is deliberately absent:
# ready Artifacts are retained until deliberate Administrator deletion
# (Req 20.1, 20.2). Application-level lifecycle workers remove only unreferenced
# pending reservations and tombstoned content, so no time-based
# object-expiration transition is configured here.
resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {} # whole bucket

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.artifacts]
}
