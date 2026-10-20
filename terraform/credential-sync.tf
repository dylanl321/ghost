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

# __NEXT__
