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
