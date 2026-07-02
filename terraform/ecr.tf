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
# The CI build dual-tags every image (see .gitlab-ci.yml):
#   - <env>                     mutable tag the ECS task definition pulls (dev/master/test)
#   - <env>-<short_sha>         immutable, per-commit tag for traceability + rollback
#
# Rules are evaluated in priority order; the first matching rule wins for a given image.
#   1. Keep the last N immutable per-commit tags (rollback window), expire older ones.
#   2. Expire untagged images after a short grace period. Each new push to the
#      mutable <env> tag orphans the previous image as untagged; this sweeps them
#      (including the existing backlog on first apply). The grace period leaves a
#      brief window to recover a just-orphaned image by digest if a deploy goes bad.
#
# Safety: the live <env> tag is never selected by either rule (rule 1 only matches
# the <env>- SHA prefix; rule 2 only matches untagged), so a running service's
# image can never be expired out from under it.
resource "aws_ecr_lifecycle_policy" "main" {
  provider   = aws.target_deployment_account
  repository = aws_ecr_repository.main.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last ${var.ecr_keep_tagged_images} per-commit (<env>-<sha>) images for rollback"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["${var.env}-"]
          countType     = "imageCountMoreThan"
          countNumber   = var.ecr_keep_tagged_images
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
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
