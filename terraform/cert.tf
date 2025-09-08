data "aws_acm_certificate" "cert" {
  provider = aws.target_deployment_account
  # domain   = "ghost-aws.gd-ms.com"
  domain   = var.app_domain
  statuses = ["ISSUED"]
  types    = ["IMPORTED"]
}
