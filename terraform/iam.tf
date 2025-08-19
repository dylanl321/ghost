resource "aws_iam_role" "ecs_task_execution_role" {
  provider = aws.target_deployment_account
  name     = "ECS-Task-${var.app_name}-Role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecs_task_execution_role_policy" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}_secrets_policy"
  role     = aws_iam_role.ecs_task_execution_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AllowSecretsManager"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = "arn:${local.child_partition}:secretsmanager:${local.child_region}:${local.child_account_id}:secret:ghost*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_attachment" {
  provider  = aws.target_deployment_account
  role      = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws-us-gov:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_step_fuction_permission" {
  provider  = aws.target_deployment_account
  role      = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:${local.child_partition}:iam::aws:policy/AWSStepFunctionsFullAccess"
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_dynamodb_read_only" {
  provider  = aws.target_deployment_account
  role      = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:${local.child_partition}:iam::aws:policy/AmazonDynamoDBReadOnlyAccess"
}
