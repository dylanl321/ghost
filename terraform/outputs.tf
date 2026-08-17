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

output "chat_jobs_queue_url" {
  value = aws_sqs_queue.chat_jobs.url
}

output "dataset_export_jobs_queue_url" {
  value = aws_sqs_queue.dataset_export_jobs.url
}

output "dataset_export_jobs_table_name" {
  value = aws_dynamodb_table.dataset_export_jobs.name
}
