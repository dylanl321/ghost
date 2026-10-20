data "archive_file" "credential_sync" {
  type        = "zip"
  source_file = "${path.module}/lambda/credential_sync.py"
  output_path = "${path.module}/credential-sync.zip"
}

resource "aws_iam_role" "credential_sync" {
  count    = var.env == "dev" ? 1 : 0
  provider = aws.target_deployment_account
  name     = "gdmsc-5177-ghost-credential-sync"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "credential_sync" {
  count    = var.env == "dev" ? 1 : 0
  provider = aws.target_deployment_account
  name     = "gdmsc-5177-ghost-credential-sync"
  role     = aws_iam_role.credential_sync[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws-us-gov:logs:us-gov-west-1:${local.child_account_id}:*"
      },
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue"]
        Resource = [
          "arn:aws-us-gov:secretsmanager:us-gov-west-1:${local.child_account_id}:secret:ghost-dashboard-credentials-*",
          "arn:aws-us-gov:secretsmanager:us-gov-west-1:${local.child_account_id}:secret:ghost-dashboard-dev-credentials-*"
        ]
      },
      {
        Effect = "Allow"
        Action = ["ecs:DescribeServices", "ecs:UpdateService"]
        Resource = [
          "arn:aws-us-gov:ecs:us-gov-west-1:${local.child_account_id}:service/ghost-dashboard/ghost-dashboard-service",
          "arn:aws-us-gov:ecs:us-gov-west-1:${local.child_account_id}:service/ghost-dashboard-dev/ghost-dashboard-dev-service"
        ]
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "credential_sync" {
  count             = var.env == "dev" ? 1 : 0
  provider          = aws.target_deployment_account
  name              = "/aws/lambda/gdmsc-5177-ghost-credential-sync"
  retention_in_days = 90
}

resource "aws_lambda_function" "credential_sync" {
  count            = var.env == "dev" ? 1 : 0
  provider         = aws.target_deployment_account
  function_name    = "gdmsc-5177-ghost-credential-sync"
  role             = aws_iam_role.credential_sync[0].arn
  handler          = "credential_sync.lambda_handler"
  runtime          = "python3.12"
  filename         = data.archive_file.credential_sync.output_path
  source_code_hash = data.archive_file.credential_sync.output_base64sha256
  timeout          = 840
  memory_size      = 256
  depends_on = [
    aws_cloudwatch_log_group.credential_sync,
    aws_iam_role_policy.credential_sync
  ]
}

resource "aws_lambda_permission" "credential_sync_rotator" {
  count         = var.env == "dev" ? 1 : 0
  provider      = aws.target_deployment_account
  statement_id  = "AllowCommercialTerraformOrchestratorRotator"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.credential_sync[0].function_name
  principal     = "arn:aws-us-gov:iam::374673712317:role/commercial-terraform-orchestrator-rotator-role"
}

output "credential_sync_lambda_arn" {
  value = var.env == "dev" ? aws_lambda_function.credential_sync[0].arn : null
}

