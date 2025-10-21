#
# S3 Storage for Application Data (GovCloud)
# Stores reports, exports, attachments, and other application data
#

# S3 bucket for application storage
resource "aws_s3_bucket" "app_storage" {
  provider = aws.target_deployment_account
  bucket   = "ghost-app-storage-${var.env}"

  tags = {
    Name        = "GHOST Application Storage"
    Environment = local.environment
    ManagedBy   = "Terraform"
    Purpose     = "Reports, exports, and application data"
  }
}

# Enable versioning for data protection
resource "aws_s3_bucket_versioning" "app_storage" {
  provider = aws.target_deployment_account
  bucket   = aws_s3_bucket.app_storage.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Lifecycle policies for automatic cleanup
resource "aws_s3_bucket_lifecycle_configuration" "app_storage" {
  provider = aws.target_deployment_account
  bucket   = aws_s3_bucket.app_storage.id

  # Reports older than 90 days
  rule {
    id     = "expire-reports"
    status = "Enabled"

    filter {
      prefix = "reports/"
    }

    expiration {
      days = 90
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  # Exports older than 30 days
  rule {
    id     = "expire-exports"
    status = "Enabled"

    filter {
      prefix = "exports/"
    }

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }

  # Attachments older than 60 days
  rule {
    id     = "expire-attachments"
    status = "Enabled"

    filter {
      prefix = "attachments/"
    }

    expiration {
      days = 60
    }

    noncurrent_version_expiration {
      noncurrent_days = 14
    }
  }
}

# CORS configuration for presigned URLs
resource "aws_s3_bucket_cors_configuration" "app_storage" {
  provider = aws.target_deployment_account
  bucket   = aws_s3_bucket.app_storage.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = [var.site_url]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "app_storage" {
  provider = aws.target_deployment_account
  bucket   = aws_s3_bucket.app_storage.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Public access block (keep private)
resource "aws_s3_bucket_public_access_block" "app_storage" {
  provider = aws.target_deployment_account
  bucket   = aws_s3_bucket.app_storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket logging (optional but recommended)
resource "aws_s3_bucket" "app_storage_logs" {
  provider = aws.target_deployment_account
  bucket   = "ghost-app-storage-logs-${var.env}"

  tags = {
    Name        = "GHOST Application Storage Logs"
    Environment = local.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_s3_bucket_public_access_block" "app_storage_logs" {
  provider = aws.target_deployment_account
  bucket   = aws_s3_bucket.app_storage_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "app_storage" {
  provider = aws.target_deployment_account
  bucket   = aws_s3_bucket.app_storage.id

  target_bucket = aws_s3_bucket.app_storage_logs.id
  target_prefix = "access-logs/"
}

# Output bucket name for use in other resources
output "app_storage_bucket_name" {
  description = "Name of the application storage S3 bucket"
  value       = aws_s3_bucket.app_storage.id
}

output "app_storage_bucket_arn" {
  description = "ARN of the application storage S3 bucket"
  value       = aws_s3_bucket.app_storage.arn
}
