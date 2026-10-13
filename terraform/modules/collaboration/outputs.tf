# Non-secret identifiers only. No tokens, endpoints, or org-profile values.

output "records_table_name" {
  value       = aws_dynamodb_table.records.name
  description = "Cloud_Record_Store DynamoDB table name."
}

output "records_table_arn" {
  value = aws_dynamodb_table.records.arn
}

output "artifacts_bucket_name" {
  value       = aws_s3_bucket.artifacts.bucket
  description = "Object_Store S3 bucket name."
}

output "artifacts_bucket_arn" {
  value = aws_s3_bucket.artifacts.arn
}

output "kms_key_arn" {
  value = aws_kms_key.collaboration.arn
}

output "api_role_arn" {
  value       = aws_iam_role.api.arn
  description = "Least-privilege collaboration API runtime role."
}

output "worker_role_arn" {
  value       = aws_iam_role.worker.arn
  description = "Least-privilege lifecycle worker role."
}

output "collaboration_enabled" {
  value       = var.collaboration_enabled
  description = "Disabled-first rollout state (false until pilot acceptance gates pass)."
}
