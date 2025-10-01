locals {
  secret_suffix = var.env == "prod" ? "nHKwT7" : "jxKfi8"
  secret_arn    = "arn:aws-us-gov:secretsmanager:us-gov-west-1:461760157232:secret:${var.app_name}-credentials-${local.secret_suffix}"
}

resource "aws_ecs_cluster" "main" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}"
}

resource "aws_ecs_task_definition" "main" {
  provider                 = aws.target_deployment_account
  family                   = "${var.app_name}-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.fargate_cpu
  memory                   = var.fargate_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_execution_role.arn

  container_definitions = jsonencode([
    {
      name             = var.app_name
      image            = "${aws_ecr_repository.main.repository_url}:${var.env}"
      essential        = true
      logConfiguration = {
        logDriver = "awslogs"
        options   = {
          awslogs-group         = "/ecs/${var.app_name}"
          awslogs-region        = "${local.child_region}"
          awslogs-stream-prefix = "ecs"
        }
      }
      portMappings     = [
        {
          containerPort = var.app_port
          hostPort      = var.app_port
        }
      ]
      environment      = [
        {
          name  = "NODE_ENV"
          value = var.env
        }
      ],
      secrets = [
        {
          name  = "NUXT_OIDC_PROVIDERS_ENTRA_CLIENT_ID"
          valueFrom = "${local.secret_arn}:entra_client_id::"
        },
        {
          name  = "NUXT_OIDC_PROVIDERS_ENTRA_CLIENT_SECRET"
          valueFrom = "${local.secret_arn}:entra_client_secret::"
        },
        {
          name  = "NUXT_OIDC_PROVIDERS_ENTRA_REDIRECT_URI"
          valueFrom = "${local.secret_arn}:entra_redirect_uri::"
        },
        {
          name  = "NUXT_OIDC_PROVIDERS_ENTRA_CALLBACK_REDIRECT_URL"
          valueFrom = "${local.secret_arn}:entra_callback_redirect_url::"
        },
        {
          name  = "AWS_COMMERCIAL_ACCESS_KEY_ID"
          valueFrom = "${local.secret_arn}:commercial_aws_access_key_id::"
        },
        {
          name  = "AWS_COMMERCIAL_SECRET_ACCESS_KEY"
          valueFrom = "${local.secret_arn}:commercial_aws_secret_access_key::"
        },
        {
          name  = "AWS_COMMERCIAL_REGION"
          valueFrom = "${local.secret_arn}:commercial_region::"
        },
        {
          name  = "AWS_GOVCLOUD_ACCESS_KEY_ID"
          valueFrom = "${local.secret_arn}:govcloud_aws_access_key_id::"
        },
        {
          name  = "AWS_GOVCLOUD_SECRET_ACCESS_KEY"
          valueFrom = "${local.secret_arn}:govcloud_aws_secret_access_key::"
        },
        {
          name  = "AWS_GOVCLOUD_REGION"
          valueFrom = "${local.secret_arn}:govcloud_region::"
        },
        {
          name  = "NUXT_OIDC_TOKEN_KEY"
          valueFrom = "${local.secret_arn}:oidc_token_key::"
        },
        {
          name  = "NUXT_OIDC_SESSION_SECRET"
          valueFrom = "${local.secret_arn}:oidc_session_secret::"
        },
        {
          name  = "NUXT_OIDC_AUTH_SESSION_SECRET"
          valueFrom = "${local.secret_arn}:oidc_auth_session_secret::"
        },
      ]
    }
  ])
}

resource "aws_ecs_service" "main" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.subnets
    security_groups = [aws_security_group.ecs_service.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = var.app_name
    container_port   = var.app_port
  }

  depends_on = [
    aws_iam_role.ecs_task_execution_role,
    aws_lb_listener.main
  ]
}

# Log group for ECS container
resource "aws_cloudwatch_log_group" "ecs" {
  provider          = aws.target_deployment_account
  name              = "/ecs/${var.app_name}"
  retention_in_days = 7

  tags = {
    Application = "${var.app_name}"
  }
}

# Log group specific logging setup
resource "aws_cloudwatch_log_group" "ecs_specific" {
  provider          = aws.target_deployment_account
  name              = "/ecs/${var.app_name}-specific"
  retention_in_days = 90

  tags = {
    Application = "${var.app_name}"
  }
}

# Secret to provide AWS credentials to the ECS container
resource "aws_secretsmanager_secret" "secret" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}-credentials"
}
