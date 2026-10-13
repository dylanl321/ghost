# ============================================================================
# Shared Investigations — least-privilege runtime roles (Req 21.1)
# ============================================================================
# Two roles with distinct authority:
#   * API role    -- serves collaboration reads/writes and streams artifacts.
#   * Worker role -- runs the independent lifecycle workers (abandoned-upload
#                    cleanup and tombstone permanent deletion), which need to
#                    delete every S3 object version and remove records.
#
# The API role deliberately does NOT get bulk version deletion; deletion is an
# Administrator/worker path.

data "aws_iam_policy_document" "assume_ecs_tasks" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

# --- API runtime role ---------------------------------------------------------

resource "aws_iam_role" "api" {
  name               = "${var.name}-api"
  assume_role_policy = data.aws_iam_policy_document.assume_ecs_tasks.json
  tags               = merge(local.tags, { Name = "GHOST Collaboration API" })
}

data "aws_iam_policy_document" "api" {
  # No Scan on the base table (Req 7.12); the API may Query the GSIs.
  statement {
    sid    = "RecordStoreItemAccess"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:ConditionCheckItem",
      "dynamodb:TransactGetItems",
      "dynamodb:TransactWriteItems",
    ]
    resources = [
      aws_dynamodb_table.records.arn,
      "${aws_dynamodb_table.records.arn}/index/*",
    ]
  }

  # Object_Store: stream uploads/downloads of artifact bytes. No DeleteObject.
  statement {
    sid    = "ObjectStoreReadWrite"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
  }

  statement {
    sid    = "UseCollaborationKey"
    effect = "Allow"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ]
    resources = [aws_kms_key.collaboration.arn]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "collaboration-api"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# --- Lifecycle worker role ----------------------------------------------------

resource "aws_iam_role" "worker" {
  name               = "${var.name}-worker"
  assume_role_policy = data.aws_iam_policy_document.assume_ecs_tasks.json
  tags               = merge(local.tags, { Name = "GHOST Collaboration Worker" })
}

data "aws_iam_policy_document" "worker" {
  # Workers claim restart-safe jobs and remove records/projections (Req 20.4).
  statement {
    sid    = "RecordStoreCleanup"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:ConditionCheckItem",
      "dynamodb:TransactWriteItems",
    ]
    resources = [
      aws_dynamodb_table.records.arn,
      "${aws_dynamodb_table.records.arn}/index/*",
    ]
  }

  # Workers remove abandoned pending uploads and every object version of a
  # tombstoned Investigation (Req 8.11, 20.4).
  statement {
    sid    = "ObjectStoreCleanup"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:ListBucketVersions",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts",
      "s3:ListBucketMultipartUploads",
    ]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
  }

  statement {
    sid    = "UseCollaborationKey"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ]
    resources = [aws_kms_key.collaboration.arn]
  }
}

resource "aws_iam_role_policy" "worker" {
  name   = "collaboration-worker"
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker.json
}
