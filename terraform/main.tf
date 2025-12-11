terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Partial configuration to be populated by -backend-config tag in terraform init command
  # https://developer.hashicorp.com/terraform/language/backend#partial-configuration
  backend "s3" {
    bucket         = ""
    region         = ""
    key            = ""
    dynamodb_table = ""
  }
}

provider "aws" {
  alias  = "target_deployment_account"
  region = var.aws_region
  assume_role {
    role_arn = "arn:aws-us-gov:iam::${var.account_id}:role/GDMSOrganizationsRole"
  }
}

provider "aws" {
  alias  = "org_account"
  region = var.aws_region
  assume_role {
    role_arn = "arn:aws-us-gov:iam::${var.org_account_id}:role/GDMSOrganizationsRole"
  }
}

data "aws_partition" "child_partition" { provider = aws.target_deployment_account }
data "aws_region" "child_region" { provider = aws.target_deployment_account }
data "aws_caller_identity" "child_identity" { provider = aws.target_deployment_account }

data "aws_partition" "org_partition" { provider = aws.org_account }
data "aws_region" "org_region" { provider = aws.org_account }
data "aws_caller_identity" "org_identity" { provider = aws.org_account }

locals {
  child_partition  = data.aws_partition.child_partition.partition       # Partition associated with target account (Commercial or GovCloud environment). Examples: "aws", "aws-us-gov"
  child_region     = data.aws_region.child_region.name                  # AWS region configured on the provider
  child_account_id = data.aws_caller_identity.child_identity.account_id # Target account ID
  environment      = var.env                                            # Environment name (dev/prod) for resource tagging

  org_partition  = data.aws_partition.org_partition.partition       # Org account partition
  org_region     = data.aws_region.org_region.name                  # Org account region
  org_account_id = data.aws_caller_identity.org_identity.account_id # Org account ID (Account A)
}
