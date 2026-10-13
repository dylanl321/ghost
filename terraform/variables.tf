variable "account_id" {
  description = "Account B - Deployment account (where ECS runs)"
  default     = "461760157232"
}

variable "org_account_id" {
  description = "Account A - Organization account (has SES, domain validation)"
  default     = "083876038518"
}

variable "aws_region" {
  default = "us-gov-west-1"
}

variable "app_name" {
  default = "ghost-dashboard-dev"
}

variable "app_domain" {
  default = "ghost-aws-dev.gd-ms.com"
}

variable "app_port" {
  description = "Port exposed by the docker image to redirect traffic to"
  default     = 3000
}

variable "fargate_cpu" {
  description = "Fargate instance CPU units to provision (1 vCPU = 1024 CPU units)"
  default     = "2048"
}

variable "fargate_memory" {
  description = "Fargate instance memory to provision (in MiB)"
  default     = "4096"
}

variable "vpc" {
  description = "The VPC to deploy to"
  default     = "vpc-1edd8b7a"
}

variable "subnets" {
  description = "Subnets for ECS"
  type        = list(string)
  default     = ["subnet-41b5b937", "subnet-088b8b6c"]
}

# dev or prod
variable "env" {
  default = "dev"
}

# ECR image cleanup tuning (see terraform/ecr.tf lifecycle policy)
variable "ecr_tagged_expiry_days" {
  description = "Days a historical per-commit (<env>-<sha>) image is retained before expiry."
  type        = number
  default     = 30
}

variable "ecr_untagged_expiry_days" {
  description = "Days an untagged image (orphaned by a mutable <env> tag move) is retained before expiry."
  type        = number
  default     = 7
}

# Admin Notifications
variable "admin_notification_emails" {
  description = "Comma-separated list of email addresses to receive admin notifications (feedback, errors, etc.)"
  type        = string
  default     = "dylan.lewis@gd-ms.com"
}

variable "admin_notifications_enabled" {
  description = "Enable/disable admin email notifications"
  type        = bool
  default     = true
}
variable "ghost_support_knowledge_base_model_arn" {
  description = "Approved GovCloud Bedrock foundation model or inference-profile ARN used by ghost.docs.answer"
  type        = string
  default     = "arn:aws-us-gov:bedrock:us-gov-west-1:926182194632:inference-profile/us-gov.anthropic.claude-sonnet-4-5-20250929-v1:0"

  validation {
    condition = can(regex(
      "^arn:aws[^:]*:bedrock:[^:]+:[^:]*:(foundation-model|inference-profile|application-inference-profile)/.+$",
      trimspace(var.ghost_support_knowledge_base_model_arn)
    ))
    error_message = "ghost_support_knowledge_base_model_arn must be a Bedrock foundation-model or inference-profile ARN."
  }
}

# ============================================================================
# Shared Investigations collaboration (disabled-first rollout)
# ============================================================================
# Spec: .kiro/specs/shared-investigations (owned by Ghostv2 Terraform).
# Collaboration persistence (DynamoDB Cloud_Record_Store, S3 Object_Store, KMS,
# runtime roles, independent lifecycle-worker scheduling) is provisioned BEFORE
# any Team_Space is enabled. Routes and pilot Team_Spaces stay disabled until
# compatible clients and pilot acceptance gates pass (Req 22.1, 24.24).

variable "collaboration_enabled" {
  description = "Master switch for GHOST collaboration routes. Stays false until compatible clients and pilot acceptance gates pass (Req 22.1)."
  type        = bool
  default     = false
}

variable "collaboration_workers_enabled" {
  description = "Whether the abandoned-upload and tombstone-deletion lifecycle worker schedules are ENABLED. Provisioned but paused until pilot enablement (Req 20.12, 22.1)."
  type        = bool
  default     = false
}

variable "collaboration_pilot_team_space_ids" {
  description = "Pilot Team_Space identifiers permitted to be enabled. Empty until compatible clients and acceptance gates are ready (Req 22.1, 24.24)."
  type        = list(string)
  default     = []

  validation {
    # Guardrail: no Team_Space may be listed while collaboration is disabled.
    condition     = var.collaboration_enabled || length(var.collaboration_pilot_team_space_ids) == 0
    error_message = "collaboration_pilot_team_space_ids must be empty while collaboration_enabled is false (disabled-first rollout, Req 22.1)."
  }
}

variable "collaboration_abandoned_upload_schedule" {
  description = "Cadence for the abandoned-pending-upload cleanup worker. Independent of report scheduling and browser availability (Req 20.12, 8.11)."
  type        = string
  default     = "rate(1 hour)"
}

variable "collaboration_deletion_cleanup_schedule" {
  description = "Cadence for the tombstone permanent-deletion cleanup worker (Req 20.4, 20.5, 20.12)."
  type        = string
  default     = "rate(15 minutes)"
}

variable "collaboration_kms_deletion_window_days" {
  description = "Deletion window (in days) for the dedicated collaboration KMS key."
  type        = number
  default     = 30

  validation {
    condition     = var.collaboration_kms_deletion_window_days >= 7 && var.collaboration_kms_deletion_window_days <= 30
    error_message = "collaboration_kms_deletion_window_days must be between 7 and 30."
  }
}

# The lifecycle worker compute (scheduled ECS task or Lambda) is owned by the
# GHOST service deployment. This module owns the INDEPENDENT scheduling of that
# compute. When a target ARN is supplied the schedule is created; otherwise it
# is skipped so infrastructure can be planned before the worker compute exists.
variable "collaboration_abandoned_upload_target_arn" {
  description = "ARN the abandoned-upload cleanup schedule invokes (e.g. Lambda or ECS task). Optional until worker compute exists (Req 20.12)."
  type        = string
  default     = null
  nullable    = true
}

variable "collaboration_deletion_cleanup_target_arn" {
  description = "ARN the tombstone deletion cleanup schedule invokes. Optional until worker compute exists (Req 20.12)."
  type        = string
  default     = null
  nullable    = true
}
