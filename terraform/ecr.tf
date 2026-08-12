resource "aws_ecr_repository" "main" {
  provider     = aws.target_deployment_account
  name         = var.app_name
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

# Lifecycle policy to clean up accumulated images.
#
# CI dual-tags each build with <env> and <env>-<short_sha>. The active digest
# therefore matches both tagged-image rules. ECR prevents a lower-priority rule
# from expiring an image that matches a higher-priority rule, so rule 1 acts as a
# keep guard for the exact live tag while rule 2 ages out historical commit tags.
resource "aws_ecr_lifecycle_policy" "main" {
  provider   = aws.target_deployment_account
  repository = aws_ecr_repository.main.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Protect the image carrying the live ${var.env} tag"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = [var.env]
          countType      = "imageCountMoreThan"
          countNumber    = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expire ${var.env}-<sha> images after ${var.ecr_tagged_expiry_days} days"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["${var.env}-*"]
          countType      = "sinceImagePushed"
          countUnit      = "days"
          countNumber    = var.ecr_tagged_expiry_days
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 3
        description  = "Expire untagged images after ${var.ecr_untagged_expiry_days} days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = var.ecr_untagged_expiry_days
        }
        action = { type = "expire" }
      },
    ]
  })
}
