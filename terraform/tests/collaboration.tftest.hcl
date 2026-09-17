# Terraform assertions for the Shared Investigations collaboration persistence
# layer (spec .kiro/specs/shared-investigations, task 3.1).
#
# These runs use `command = apply` against a fully mocked AWS provider, so they
# need no AWS credentials, no network, and never touch real resources (the mock
# provider fabricates all values in-memory). They assert the
# storage controls the spec requires (Req 7.1, 8.1), the disabled-first rollout
# (Req 22.1), and the absence of legacy 90-day private-evidence expiration
# (Req 20.1, 20.2, 21.10).

# Default (unaliased) provider: the root declares only aliased providers, but
# `terraform test` still instantiates a default aws provider. Mock it so no real
# credentials are required, and supply valid placeholder JSON for any policy
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  # The AWS provider validates the *shape* of computed ARNs that are fed back
  # into other resources across the whole root module (KMS keys, IAM policies,
  # load balancer, target group, SNS topics). Give those a valid ARN so the
  # whole-root apply the test engine performs succeeds; the collaboration
  # assertions below only compare our own resource attributes.
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws-us-gov:kms:us-gov-west-1:461760157232:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws-us-gov:iam::461760157232:policy/mock-policy" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws-us-gov:elasticloadbalancing:us-gov-west-1:461760157232:loadbalancer/app/mock/0000000000000000" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws-us-gov:elasticloadbalancing:us-gov-west-1:461760157232:targetgroup/mock/0000000000000000" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws-us-gov:sns:us-gov-west-1:461760157232:mock-topic" }
  }
} }
}

mock_provider "aws" {
  alias = "target_deployment_account"

  # aws_iam_policy_document renders a computed `json` attribute; the mock would
  # otherwise emit a random string that fails JSON policy validation on the
  # roles/keys that consume it. Supply valid placeholder JSON.
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_data "aws_region" {
    defaults = {
      name = "us-gov-west-1"
    }
  }

  # Same ARN-shape mocks as the default provider: collaboration resources are
  # created on this aliased provider and feed computed ARNs back into other
  # resources that validate ARN shape.
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws-us-gov:kms:us-gov-west-1:461760157232:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws-us-gov:iam::461760157232:policy/mock-policy" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws-us-gov:elasticloadbalancing:us-gov-west-1:461760157232:loadbalancer/app/mock/0000000000000000" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws-us-gov:elasticloadbalancing:us-gov-west-1:461760157232:targetgroup/mock/0000000000000000" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws-us-gov:sns:us-gov-west-1:461760157232:mock-topic" }
  }
}

mock_provider "aws" {
  alias = "org_account"region are consumed in ARNs and IAM policy ARNs, which
  # must match the aws(-[a-z]+)* partition regex.
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "461760157232"
    }
  }

  mock_data "aws_partition" {
    defaults = {
      partition = "aws-us-gov"
    }
  }

  mock_data "aws_region" {
    defaults = {
      name = "us-gov-west-1"
    }
  }
}

mock_provider "aws" {
  alias = "org_account"

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "083876038518"
    }
  }

  mock_data "aws_partition" {
    defaults = {
      partition = "aws-us-gov"
    }
  }

  mock_data "aws_region" {
    defaults = {
      name = "us-gov-west-1"
    }
  }
}

variables {
  env                                = "test"
  collaboration_enabled              = false
  collaboration_workers_enabled      = false
  collaboration_pilot_team_space_ids = []
}

# Req 7.1: one dedicated on-demand DynamoDB Cloud_Record_Store with KMS
# encryption and point-in-time recovery.
run "record_store_is_on_demand_kms_pitr" {
  command = plan

  assert {
    condition     = aws_dynamodb_table.collaboration_records.billing_mode == "PAY_PER_REQUEST"
    error_message = "Cloud_Record_Store must use on-demand (PAY_PER_REQUEST) billing (Req 7.1)."
  }

  assert {
    condition     = aws_dynamodb_table.collaboration_records.point_in_time_recovery[0].enabled == true
    error_message = "Cloud_Record_Store must have point-in-time recovery enabled (Req 7.1)."
  }

  assert {
    condition     = aws_dynamodb_table.collaboration_records.server_side_encryption[0].enabled == true
    error_message = "Cloud_Record_Store must have server-side encryption enabled (Req 7.1)."
  }

  # KMS: the table encrypts with the dedicated collaboration CMK.
  assert {
    condition     = aws_dynamodb_table.collaboration_records.server_side_encryption[0].kms_key_arn == aws_kms_key.collaboration.arn
    error_message = "Cloud_Record_Store must be encrypted with the dedicated collaboration KMS key (Req 7.1)."
  }

  # Tenant + Team_Space composite keying (Req 7.2) is realized through the
  # PK/SK hash/range keys.
  assert {
    condition     = aws_dynamodb_table.collaboration_records.hash_key == "PK" && aws_dynamodb_table.collaboration_records.range_key == "SK"
    error_message = "Cloud_Record_Store must key on PK/SK to embed Tenant and Team_Space (Req 7.2)."
  }

  # No-scan browsing paths exist as GSIs (Req 7.12).
  assert {
    condition     = length(aws_dynamodb_table.collaboration_records.global_secondary_index) == 2
    error_message = "Subject lookup and browse GSIs must exist so routine scans are unnecessary (Req 7.12)."
  }
}

# Req 8.1: dedicated private Object_Store with versioning, KMS encryption,
# public-access blocking, and transport encryption enforcement.
run "object_store_is_private_versioned_kms" {
  command = plan

  assert {
    condition     = aws_s3_bucket_versioning.collaboration_artifacts.versioning_configuration[0].status == "Enabled"
    error_message = "Object_Store must have versioning enabled (Req 8.1)."
  }

  assert {
    condition     = aws_s3_bucket_server_side_encryption_configuration.collaboration_artifacts.rule[0].apply_server_side_encryption_by_default[0].sse_algorithm == "aws:kms"
    error_message = "Object_Store must default to KMS encryption (Req 8.1)."
  }

  assert {
    condition     = aws_s3_bucket_server_side_encryption_configuration.collaboration_artifacts.rule[0].apply_server_side_encryption_by_default[0].kms_master_key_id == aws_kms_key.collaboration.arn
    error_message = "Object_Store must encrypt with the dedicated collaboration KMS key (Req 8.1)."
  }

  assert {
    condition = (
      aws_s3_bucket_public_access_block.collaboration_artifacts.block_public_acls &&
      aws_s3_bucket_public_access_block.collaboration_artifacts.block_public_policy &&
      aws_s3_bucket_public_access_block.collaboration_artifacts.ignore_public_acls &&
      aws_s3_bucket_public_access_block.collaboration_artifacts.restrict_public_buckets
    )
    error_message = "Object_Store must block all public access (Req 8.1)."
  }
}

# Req 20.1, 20.2 / 21.10: no legacy 90-day private-evidence expiration.
# The only lifecycle rule is abandoned-upload hygiene (abort incomplete
# multipart after 7 days) with no expiration or transition blocks.
run "object_store_has_no_legacy_expiration" {
  command = plan

  assert {
    condition     = length(aws_s3_bucket_lifecycle_configuration.collaboration_artifacts.rule) == 1
    error_message = "Object_Store must have exactly one lifecycle rule (abandoned-upload hygiene only)."
  }

  assert {
    condition     = length(aws_s3_bucket_lifecycle_configuration.collaboration_artifacts.rule[0].expiration) == 0
    error_message = "Object_Store lifecycle must not expire objects: durable retention until deliberate deletion (Req 20.1, 20.2)."
  }

  assert {
    condition     = length(aws_s3_bucket_lifecycle_configuration.collaboration_artifacts.rule[0].transition) == 0
    error_message = "Object_Store lifecycle must not apply time-based transitions (no expiring private-evidence contract, Req 21.10)."
  }

  assert {
    condition     = aws_s3_bucket_lifecycle_configuration.collaboration_artifacts.rule[0].abort_incomplete_multipart_upload[0].days_after_initiation == 7
    error_message = "Abandoned-upload hygiene must abort incomplete uploads after 7 days (Req 8.11)."
  }
}

# Req 20.12 / 8.11: independent lifecycle worker scheduling stays DISABLED while
# collaboration is disabled-first (Req 22.1). With target ARNs supplied the
# schedules exist but are paused.
run "worker_schedules_are_disabled_first" {
  command = plan

  variables {
    collaboration_abandoned_upload_target_arn = "arn:aws-us-gov:lambda:us-gov-west-1:461760157232:function:collab-abandoned"
    collaboration_deletion_cleanup_target_arn = "arn:aws-us-gov:lambda:us-gov-west-1:461760157232:function:collab-deletion"
  }

  assert {
    condition     = aws_scheduler_schedule.collaboration_abandoned_upload_cleanup[0].state == "DISABLED"
    error_message = "Abandoned-upload cleanup schedule must be DISABLED until pilot enablement (Req 22.1, 20.12)."
  }

  assert {
    condition     = aws_scheduler_schedule.collaboration_deletion_cleanup[0].state == "DISABLED"
    error_message = "Deletion cleanup schedule must be DISABLED until pilot enablement (Req 22.1, 20.12)."
  }
}
