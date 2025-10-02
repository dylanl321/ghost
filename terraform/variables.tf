variable "account_id" {
  default = "461760157232"
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