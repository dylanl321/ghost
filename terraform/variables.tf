variable "account_id" {
  default = "461760157232"
}

variable "aws_region" {
  description = "AWS region to deploy resources in"
  type        = string
  default     = "us-east-1"
}

variable "govcloud_region" {
  description = "AWS GovCloud region to deploy resources in"
  type        = string
  default     = "us-gov-west-1"
}

# variable "govcloud_profile" {
#   description = "AWS profile for GovCloud access"
#   type        = string
#   default     = "govcloud"
# }

variable "environment" {
  description = "Deployment environment (e.g., dev, staging, prod)"
  type        = string
  default     = "prod"
}

# variable "s3_bucket_name" {
#   description = "Name of the S3 bucket for storing logs and artifacts"
#   type        = string
#   default     = "pipeline-logs-and-artifacts-374673712317"
# }

# variable "dynamodb_pipelines_table" {
#   description = "Name of the DynamoDB table for storing pipeline metadata"
#   type        = string
#   default     = "GITLAB_PIPELINES"
# }

# variable "dynamodb_jobs_table" {
#   description = "Name of the DynamoDB table for storing job metadata"
#   type        = string
#   default     = "GITLAB_PIPELINES_JOBS"
# }

# variable "dynamodb_account_associations_table" {
#   description = "Name of the DynamoDB table for storing account associations"
#   type        = string
#   default     = "GITLAB_ACCOUNT_ASSOCIATIONS"
# }

# variable "accounts_table" {
#   description = "Name of the DynamoDB table containing AWS account information"
#   type        = string
#   default     = "gdms_aws_accounts-master"
# }

# variable "log_retention_days" {
#   description = "Number of days to retain logs in CloudWatch"
#   type        = number
#   default     = 30
# }

# variable "transition_to_infrequent_access_days" {
#   description = "Number of days before transitioning files to infrequent access storage"
#   type        = number
#   default     = 90
# }

# variable "transition_to_glacier_days" {
#   description = "Number of days before transitioning files to glacier storage"
#   type        = number
#   default     = 180
# }

# variable "log_expiration_days" {
#   description = "Number of days before logs expire"
#   type        = number
#   default     = 365
# }

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
  default     = "4096"
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