data "archive_file" "credential_sync" {
  type        = "zip"
  source_file = "${path.module}/lambda/credential_sync.py"
  output_path = "${path.module}/credential-sync.zip"
}

resource "aws_iam_role" "credential_sync" {
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
  provider = aws.target_deployment_account
  name     = "gdmsc-5177-ghost-credential-sync"
  role     = aws_iam_role.credential_sync.id
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

# __NEXT__
