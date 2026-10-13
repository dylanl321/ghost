# Terraform assertions for the Shared Investigations collaboration persistence
# module (spec .kiro/specs/shared-investigations, task 3.1).
#
# Runs use `command = apply` against a fully mocked AWS provider: no AWS
# credentials, no network, no real resources (the mock provider fabricates all
# values in-memory). They assert the storage controls the spec requires
# (Req 7.1, 8.1), the disabled-first rollout (Req 22.1), and the absence of the
# legacy 90-day private-evidence expiration (Req 20.1, 20.2, 21.10).

mock_provider "aws" {
  # aws_iam_policy_document renders a computed `json` attribute that would
  # otherwise be a random string and fail JSON policy validation on the
  # roles/keys that consume it. Supply valid placeholder JSON.
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  # KMS ARN is fed into DynamoDB/S3 encryption arguments that validate ARN
  # shape; give it a valid ARN.
  mock_resource "aws_kms_key" {
    defaults = {
      arn = "arn:aws-us-gov:kms:us-gov-west-1:461760157232:key/00000000-0000-0000-0000-000000000000"
    }
  }

  # The worker role ARN is consumed by the scheduler target's role_arn, which
  # validates ARN shape; give it a valid ARN.
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws-us-gov:iam::461760157232:role/mock-collaboration-role"
    }
  }
}

variables {
  name                  = "ghost-collaboration-test"
  partition             = "aws-us-gov"
  account_id            = "461760157232"
  collaboration_enabled = false
  workers_enabled       = false
  pilot_team_space_ids  = []
}

# Req 7.1: one dedicated on-demand DynamoDB Cloud_Record_Store with KMS
# encryption and point-in-time recovery.
run "record_store_is_on_demand_kms_pitr" {
  command = apply

  assert {
    condition     = aws_dynamodb_table.records.billing_mode == "PAY_PER_REQUEST"
    error_message = "Cloud_Record_Store must use on-demand (PAY_PER_REQUEST) billing (Req 7.1)."
  }

  assert {
    condition     = aws_dynamodb_table.records.point_in_time_recovery[0].enabled == true
    error_message = "Cloud_Record_Store must have point-in-time recovery enabled (Req 7.1)."
  }

  assert {
    condition     = aws_dynamodb_table.records.server_side_encryption[0].enabled == true
    error_message = "Cloud_Record_Store must have server-side encryption enabled (Req 7.1)."
  }

  assert {
    condition     = aws_dynamodb_table.records.server_side_encryption[0].kms_key_arn == aws_kms_key.collaboration.arn
    error_message = "Cloud_Record_Store must be encrypted with the dedicated collaboration KMS key (Req 7.1)."
  }

  # Tenant + Team_Space composite keying (Req 7.2) via PK/SK.
  assert {
    condition     = aws_dynamodb_table.records.hash_key == "PK" && aws_dynamodb_table.records.range_key == "SK"
    error_message = "Cloud_Record_Store must key on PK/SK to embed Tenant and Team_Space (Req 7.2)."
  }

  # No-scan browsing paths exist as GSIs (Req 7.12).
  assert {
    condition     = length(aws_dynamodb_table.records.global_secondary_index) == 2
    error_message = "Subject lookup and browse GSIs must exist so routine scans are unnecessary (Req 7.12)."
  }
}

# Req 8.1: dedicated private Object_Store with versioning, KMS encryption,
# public-access blocking, and transport encryption enforcement.
run "object_store_is_private_versioned_kms" {
  command = apply

  assert {
    condition     = aws_s3_bucket_versioning.artifacts.versioning_configuration[0].status == "Enabled"
    error_message = "Object_Store must have versioning enabled (Req 8.1)."
  }

  assert {
    condition     = one([for r in aws_s3_bucket_server_side_encryption_configuration.artifacts.rule : one(r.apply_server_side_encryption_by_default).sse_algorithm]) == "aws:kms"
    error_message = "Object_Store must default to KMS encryption (Req 8.1)."
  }

  assert {
    condition     = one([for r in aws_s3_bucket_server_side_encryption_configuration.artifacts.rule : one(r.apply_server_side_encryption_by_default).kms_master_key_id]) == aws_kms_key.collaboration.arn
    error_message = "Object_Store must encrypt with the dedicated collaboration KMS key (Req 8.1)."
  }

  assert {
    condition = (
      aws_s3_bucket_public_access_block.artifacts.block_public_acls &&
      aws_s3_bucket_public_access_block.artifacts.block_public_policy &&
      aws_s3_bucket_public_access_block.artifacts.ignore_public_acls &&
      aws_s3_bucket_public_access_block.artifacts.restrict_public_buckets
    )
    error_message = "Object_Store must block all public access (Req 8.1)."
  }
}

# Req 20.1, 20.2 / 21.10: no legacy 90-day private-evidence expiration.
# The only lifecycle rule is abandoned-upload hygiene (abort incomplete
# multipart after 7 days) with no expiration or transition blocks.
run "object_store_has_no_legacy_expiration" {
  command = apply

  assert {
    condition     = length(aws_s3_bucket_lifecycle_configuration.artifacts.rule) == 1
    error_message = "Object_Store must have exactly one lifecycle rule (abandoned-upload hygiene only)."
  }

  assert {
    condition     = length(aws_s3_bucket_lifecycle_configuration.artifacts.rule[0].expiration) == 0
    error_message = "Object_Store lifecycle must not expire objects: durable retention until deliberate deletion (Req 20.1, 20.2)."
  }

  assert {
    condition     = length(aws_s3_bucket_lifecycle_configuration.artifacts.rule[0].transition) == 0
    error_message = "Object_Store lifecycle must not apply time-based transitions (no expiring private-evidence contract, Req 21.10)."
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.artifacts.rule[0].abort_incomplete_multipart_upload[0].days_after_initiation == 7
    error_message = "Abandoned-upload hygiene must abort incomplete uploads after 7 days (Req 8.11)."
  }
}

# Req 20.12 / 8.11: independent lifecycle worker scheduling stays DISABLED while
# collaboration is disabled-first (Req 22.1). With target ARNs supplied the
# schedules exist but are paused.
run "worker_schedules_are_disabled_first" {
  command = apply

  variables {
    abandoned_upload_target_arn = "arn:aws-us-gov:lambda:us-gov-west-1:461760157232:function:collab-abandoned"
    deletion_cleanup_target_arn = "arn:aws-us-gov:lambda:us-gov-west-1:461760157232:function:collab-deletion"
  }

  assert {
    condition     = aws_scheduler_schedule.abandoned_upload_cleanup[0].state == "DISABLED"
    error_message = "Abandoned-upload cleanup schedule must be DISABLED until pilot enablement (Req 22.1, 20.12)."
  }

  assert {
    condition     = aws_scheduler_schedule.deletion_cleanup[0].state == "DISABLED"
    error_message = "Deletion cleanup schedule must be DISABLED until pilot enablement (Req 22.1, 20.12)."
  }
}

# Guardrail: no pilot Team_Space may be listed while collaboration is disabled
# (disabled-first rollout, Req 22.1).
run "pilot_space_guardrail_blocks_enabling_while_disabled" {
  command = plan

  variables {
    collaboration_enabled = false
    pilot_team_space_ids  = ["pilot-space-1"]
  }

  expect_failures = [var.pilot_team_space_ids]
}
