# ============================================================================
# Shared Investigations — collaboration persistence (disabled-first)
# ============================================================================
# Ownership: Ghostv2 Terraform.
# Spec: .kiro/specs/shared-investigations (task 3.1).
#
# Provisions the GHOST-side collaboration persistence layer BEFORE any
# Team_Space is enabled: one dedicated on-demand DynamoDB Cloud_Record_Store
# (KMS + PITR, Req 7.1), one dedicated private versioned S3 Object_Store
# (KMS/public-access/TLS controls, Req 8.1), least-privilege API and worker
# runtime roles (Req 21.1), and independent lifecycle worker scheduling
# (Req 20.12). Collaboration routes and pilot Team_Spaces stay disabled until
# compatible clients and pilot acceptance gates pass (Req 22.1, 24.24); the
# legacy 90-day private-evidence lifecycle rules are deliberately not applied.
#
# Implementation lives in modules/collaboration so it can be verified in
# isolation with Terraform test assertions.

module "collaboration" {
  source = "./modules/collaboration"

  # The child account provider carries the assume-role; partition/account are
  # resolved from it and passed in so the module stays provider-agnostic.
  providers = {
    aws = aws.target_deployment_account
  }

  name       = var.env == "prod" ? "ghost-collaboration-prod" : "ghost-collaboration"
  partition  = local.child_partition
  account_id = local.child_account_id

  tags = {
    Environment = local.environment
    ManagedBy   = "Terraform"
    Service     = "GHOST"
  }

  # Disabled-first rollout.
  collaboration_enabled = var.collaboration_enabled
  workers_enabled       = var.collaboration_workers_enabled
  pilot_team_space_ids  = var.collaboration_pilot_team_space_ids

  # Independent lifecycle worker cadence and (optional) invocation targets.
  abandoned_upload_schedule   = var.collaboration_abandoned_upload_schedule
  deletion_cleanup_schedule   = var.collaboration_deletion_cleanup_schedule
  abandoned_upload_target_arn = var.collaboration_abandoned_upload_target_arn
  deletion_cleanup_target_arn = var.collaboration_deletion_cleanup_target_arn

  kms_deletion_window_days = var.collaboration_kms_deletion_window_days
}
