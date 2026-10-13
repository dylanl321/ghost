# ============================================================================
# Shared Investigations — independent lifecycle worker scheduling
# ============================================================================
# Req 20.12, 8.11: the abandoned-upload cleanup and the tombstone
# permanent-deletion cleanup run on their own EventBridge Scheduler schedules,
# independent of GHOST report scheduling and browser availability. Schedules are
# DISABLED until pilot enablement flips workers_enabled, matching the
# disabled-first rollout (Req 22.1).
#
# The worker compute itself is owned by the GHOST service deployment. A schedule
# is created only when its target ARN is supplied, so this can be planned before
# that compute exists.

locals {
  # Both master switch and per-run flag must be on for a schedule to run.
  schedule_state = (var.collaboration_enabled && var.workers_enabled) ? "ENABLED" : "DISABLED"

  create_abandoned_schedule = var.abandoned_upload_target_arn != null
  create_deletion_schedule  = var.deletion_cleanup_target_arn != null
}

data "aws_iam_policy_document" "assume_scheduler" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.assume_scheduler.json
  tags               = merge(local.tags, { Name = "GHOST Collaboration Scheduler" })
}

# The scheduler assumes the worker role to run cleanup work (least privilege:
# it can only assume the dedicated worker role).
data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    sid       = "AssumeWorkerRole"
    effect    = "Allow"
    actions   = ["sts:AssumeRole"]
    resources = [aws_iam_role.worker.arn]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "invoke-worker"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

resource "aws_scheduler_schedule" "abandoned_upload_cleanup" {
  count = local.create_abandoned_schedule ? 1 : 0

  name       = "${var.name}-abandoned-upload-cleanup"
  group_name = "default"
  state      = local.schedule_state

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression = var.abandoned_upload_schedule

  target {
    arn      = var.abandoned_upload_target_arn
    role_arn = aws_iam_role.worker.arn
  }
}

resource "aws_scheduler_schedule" "deletion_cleanup" {
  count = local.create_deletion_schedule ? 1 : 0

  name       = "${var.name}-deletion-cleanup"
  group_name = "default"
  state      = local.schedule_state

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression = var.deletion_cleanup_schedule

  target {
    arn      = var.deletion_cleanup_target_arn
    role_arn = aws_iam_role.worker.arn
  }
}
