# Inputs for the Shared Investigations collaboration persistence module.
# The caller (root) resolves partition/account/region from the assume-role
# provider and passes them in, keeping this module provider-agnostic and
# unit-testable in isolation.

variable "name" {
  description = "Resource name stem, e.g. ghost-collaboration or ghost-collaboration-prod."
  type        = string
}

variable "partition" {
  description = "AWS partition (e.g. aws-us-gov)."
  type        = string
}

variable "account_id" {
  description = "Deployment account ID."
  type        = string
}

variable "tags" {
  description = "Common tags applied to every collaboration resource."
  type        = map(string)
  default     = {}
}

# --- Disabled-first rollout controls -----------------------------------------

variable "collaboration_enabled" {
  description = "Master switch for GHOST collaboration routes. Stays false until compatible clients and pilot acceptance gates pass (Req 22.1)."
  type        = bool
  default     = false
}

variable "workers_enabled" {
  description = "Whether the lifecycle worker schedules are ENABLED. Provisioned but paused until pilot enablement (Req 20.12, 22.1)."
  type        = bool
  default     = false
}

variable "pilot_team_space_ids" {
  description = "Pilot Team_Space identifiers permitted to be enabled. Empty until compatible clients and acceptance gates are ready (Req 22.1, 24.24)."
  type        = list(string)
  default     = []

  validation {
    condition     = var.collaboration_enabled || length(var.pilot_team_space_ids) == 0
    error_message = "pilot_team_space_ids must be empty while collaboration_enabled is false (disabled-first rollout, Req 22.1)."
  }
}

# --- Lifecycle worker cadence and targets ------------------------------------

variable "abandoned_upload_schedule" {
  description = "Cadence for the abandoned-pending-upload cleanup worker (Req 20.12, 8.11)."
  type        = string
  default     = "rate(1 hour)"
}

variable "deletion_cleanup_schedule" {
  description = "Cadence for the tombstone permanent-deletion cleanup worker (Req 20.4, 20.5, 20.12)."
  type        = string
  default     = "rate(15 minutes)"
}

variable "abandoned_upload_target_arn" {
  description = "ARN the abandoned-upload cleanup schedule invokes. Optional until worker compute exists (Req 20.12)."
  type        = string
  default     = null
  nullable    = true
}

variable "deletion_cleanup_target_arn" {
  description = "ARN the tombstone deletion cleanup schedule invokes. Optional until worker compute exists (Req 20.12)."
  type        = string
  default     = null
  nullable    = true
}

variable "kms_deletion_window_days" {
  description = "Deletion window (days) for the dedicated collaboration KMS key."
  type        = number
  default     = 30

  validation {
    condition     = var.kms_deletion_window_days >= 7 && var.kms_deletion_window_days <= 30
    error_message = "kms_deletion_window_days must be between 7 and 30."
  }
}
