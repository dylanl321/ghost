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
