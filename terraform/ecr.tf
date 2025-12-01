resource "aws_ecr_repository" "main" {
  provider     = aws.target_deployment_account
  name         = "${var.app_name}"
  force_delete = true
}

data "aws_iam_policy_document" "main" {
  statement {
    sid    = "AllowPull"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [var.account_id]
    }

    actions = [
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:BatchCheckLayerAvailability",
    ]
  }
}

resource "aws_ecr_repository_policy" "main" {
  provider   = aws.target_deployment_account
  repository = aws_ecr_repository.main.name
  policy     = data.aws_iam_policy_document.main.json
}
