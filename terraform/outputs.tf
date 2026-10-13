output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "load_balancer_dns" {
  value = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.main.repository_url
}

output "deployment_account_id" {
  value       = local.child_account_id
  description = "The AWS account ID where the resources are being deployed"
}



output "dataset_export_jobs_queue_url" {
  value = aws_sqs_queue.dataset_export_jobs.url
}

output "dataset_export_jobs_table_name" {
  value = aws_dynamodb_table.dataset_export_jobs.name
}

# ============================================================================
# Shared Investigations collaboration (non-secret identifiers only)
# ============================================================================
# No tokens, endpoints, or org-profile values are exposed here.

output "collaboration_records_table_name" {
  value       = module.collaboration.records_table_name
  description = "Cloud_Record_Store DynamoDB table name."
}

output "collaboration_records_table_arn" {
  value = module.collaboration.records_table_arn
}

output "collaboration_artifacts_bucket_name" {
  value       = module.collaboration.artifacts_bucket_name
  description = "Object_Store S3 bucket name."
}

output "collaboration_artifacts_bucket_arn" {
  value = module.collaboration.artifacts_bucket_arn
}

output "collaboration_kms_key_arn" {
  value = module.collaboration.kms_key_arn
}

output "collaboration_api_role_arn" {
  value       = module.collaboration.api_role_arn
  description = "Least-privilege collaboration API runtime role."
}

output "collaboration_worker_role_arn" {
  value       = module.collaboration.worker_role_arn
  description = "Least-privilege lifecycle worker role."
}

output "collaboration_enabled" {
  value       = module.collaboration.collaboration_enabled
  description = "Disabled-first rollout state (false until pilot acceptance gates pass)."
}
