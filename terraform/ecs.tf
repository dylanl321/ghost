locals {
  secret_suffix = var.env == "prod" ? "nHKwT7" : "jxKfi8"
  secret_arn    = "arn:aws-us-gov:secretsmanager:us-gov-west-1:461760157232:secret:${var.app_name}-credentials-${local.secret_suffix}"
}

resource "aws_ecs_cluster" "main" {
  provider = aws.target_deployment_account
  name     = var.app_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Application = var.app_name
    Environment = var.env
  }
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
      name      = var.app_name
      image     = "${aws_ecr_repository.main.repository_url}:${var.env}"
      essential = true
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/${var.app_name}"
          awslogs-region        = "${local.child_region}"
          awslogs-stream-prefix = "ecs"
        }
      }
      portMappings = [
        {
          containerPort = var.app_port
          hostPort      = var.app_port
        }
      ]
      environment = [
        {
          name  = "NODE_ENV"
          value = var.env
        },
        # Admin Access Bypass - allows all authenticated users to have admin access
        # Required in ECS because Microsoft Graph API integration for group checking is not available
        {
          name  = "ADMIN_BYPASS"
          value = "true"
        },
        {
          name  = "DYNAMODB_CONFIG_SECRET_NAME"
          value = aws_secretsmanager_secret.dynamodb_config.name
        },
        # AWS Configuration (now managed via Site Config DynamoDB table)
        # These env vars serve as fallbacks only - primary config is in ghost-site-config table
        # To update: Use Admin Panel > System > Site Configuration > AWS Configuration
        {
          name  = "AWS_COMMERCIAL_REGION"
          value = "us-east-1"
        },
        {
          name  = "AWS_GOVCLOUD_REGION"
          value = "us-gov-west-1"
        },
        {
          name  = "AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID"
          value = "205950196477"
        },
        {
          name  = "AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID"
          value = "374673712317"
        },
        {
          name  = "AWS_GOVCLOUD_ORGANIZATIONS_ROLE_PATH"
          value = "GD"
        },
        {
          name  = "AWS_MASTER_ACCOUNT_ID"
          value = "205950196477"
        },
        {
          name  = "AWS_PROFORMA_ACCOUNT_ID"
          value = "253821132832"
        },
        {
          name  = "AWS_DEPLOYMENT_ACCOUNT_ID"
          value = local.child_account_id
        },
        {
          name  = "AWS_ASSUME_ROLE_NAME"
          value = "GDMSOrganizationsRole"
        },
        {
          name  = "AWS_ASSUME_ROLE_DURATION"
          value = "3600"
        },
        {
          name  = "AWS_COMMERCIAL_CONFIG_AGGREGATOR"
          value = "GDMS_Aggregator"
        },
        {
          name  = "AWS_GOVCLOUD_CONFIG_AGGREGATOR"
          value = "GDMSAggregator"
        },
        # AWS Security Lake Configuration
        {
          name  = "AWS_COMMERCIAL_SECURITY_LAKE_REGION"
          value = "us-east-1"
        },
        {
          name  = "AWS_GOVCLOUD_SECURITY_LAKE_REGION"
          value = "us-gov-west-1"
        },
        {
          name  = "AWS_COMMERCIAL_SECURITY_LAKE_ACCOUNT"
          value = "253821132832"
        },
        {
          name  = "AWS_GOVCLOUD_SECURITY_LAKE_ACCOUNT"
          value = "083876038518"
        },
        {
          name  = "AWS_COMMERCIAL_ATHENA_RESULTS_BUCKET"
          value = "aws-athena-query-results-us-east-1-253821132832"
        },
        {
          name  = "AWS_GOVCLOUD_ATHENA_RESULTS_BUCKET"
          value = "aws-athena-query-results-us-gov-west-1-083876038518"
        },
        # Pipeline Analytics Configuration (Athena for GitLab pipeline telemetry)
        {
          name  = "ATHENA_PIPELINE_DATABASE"
          value = "telemetry_db"
        },
        {
          name  = "ATHENA_PIPELINE_RESULTS_BUCKET"
          value = "gdlz-gitlab-pipeline-data"
        },
        {
          name  = "ATHENA_PIPELINE_WORKGROUP"
          value = "primary"
        },
        # Entra ID Configuration (non-sensitive)
        {
          name  = "ENTRA_LOGIN_BASE_URL"
          value = "https://login.microsoftonline.us"
        },
        {
          name  = "ENTRA_TENANT_ID"
          value = "7c5a26cf-ddf0-400c-9703-4070b4e3a54d"
        },
        {
          name  = "ENTRA_GRAPH_BASE_URL"
          value = "https://graph.microsoft.us"
        },
        {
          name  = "ENTRA_GRAPH_VERSION"
          value = "v1.0"
        },
        {
          name  = "ENTRA_AWS_GROUP_PREFIX"
          value = "AWS-"
        },
        {
          name  = "ENTRA_DISTRIBUTION_GROUP_SUFFIX"
          value = ".aws"
        },
        {
          name  = "ENTRA_OWNER_DELIMITER"
          value = " // "
        },
        {
          name  = "ENTRA_CACHE_TTL"
          value = "3600"
        },
        {
          name  = "ENTRA_BATCH_SIZE"
          value = "999"
        },
        {
          name  = "ENTRA_MAX_RETRIES"
          value = "3"
        },
        {
          name  = "ENTRA_DEFAULT_DOMAIN"
          value = "gd-ms.com"
        },
        # API Keys Storage
        {
          name  = "DYNAMODB_API_KEYS_TABLE"
          value = aws_dynamodb_table.api_keys.name
        },
        {
          name  = "DYNAMODB_API_KEY_USAGE_TABLE"
          value = aws_dynamodb_table.api_keys_usage.name
        },
        {
          name  = "API_KEYS_STORAGE_ENV"
          value = "govcloud"
        },
        # Additional DynamoDB Tables
        {
          name  = "SHORTLINKS_TABLE"
          value = aws_dynamodb_table.shortlinks.name
        },
        {
          name  = "SITE_CONFIG_TABLE"
          value = aws_dynamodb_table.site_config.name
        },
        {
          name  = "CHAT_THREADS_TABLE_NAME"
          value = aws_dynamodb_table.chat_threads.name
        },
        {
          name  = "CHAT_MESSAGES_TABLE_NAME"
          value = aws_dynamodb_table.chat_messages.name
        },
        {
          name  = "ADMIN_NOTIFICATIONS_TABLE"
          value = aws_dynamodb_table.admin_notifications.name
        },
        {
          name  = "AWS_ASYNC_JOBS_TABLE_NAME"
          value = aws_dynamodb_table.async_chat_jobs.name
        },
        {
          name  = "CHAT_JOBS_QUEUE_URL"
          value = aws_sqs_queue.chat_jobs.url
        },
        {
          name  = "DATASET_EXPORT_JOBS_TABLE_NAME"
          value = aws_dynamodb_table.dataset_export_jobs.name
        },
        {
          name  = "DATASET_EXPORT_JOBS_QUEUE_URL"
          value = aws_sqs_queue.dataset_export_jobs.url
        },
        {
          name  = "AWS_ASYNC_METRICS_TABLE_NAME"
          value = aws_dynamodb_table.async_metrics.name
        },
        {
          name  = "AI_USAGE_TABLE_NAME"
          value = aws_dynamodb_table.ai_usage.name
        },
        {
          name  = "AI_USAGE_COLLECTION_ENABLED"
          value = "true"
        },
        # GHOST hosted MCP and OAuth state
        {
          name  = "GHOST_MCP_BASE_URL"
          value = var.env == "prod" ? "https://ghost-aws.gd-ms.com" : "https://ghost-aws-dev.gd-ms.com"
        },
        {
          name  = "GHOST_OAUTH_ISSUER"
          value = var.env == "prod" ? "https://ghost-aws.gd-ms.com" : "https://ghost-aws-dev.gd-ms.com"
        },
        {
          name  = "GHOST_OAUTH_TABLE_NAME"
          value = aws_dynamodb_table.oauth_artifacts.name
        },
        {
          name  = "GHOST_OAUTH_AUTHORIZATION_TTL_DAYS"
          value = "90"
        },
        {
          name  = "GHOST_MCP_AUDIT_TABLE_NAME"
          value = aws_dynamodb_table.mcp_audit.name
        },
        {
          name  = "GHOST_MCP_RAW_ERRORS_TABLE_NAME"
          value = aws_dynamodb_table.mcp_raw_errors.name
        },
        {
          name  = "GHOST_MCP_EVIDENCE_TABLE_NAME"
          value = aws_dynamodb_table.mcp_evidence.name
        },
        {
          name  = "GHOST_MCP_USAGE_DAILY_TABLE_NAME"
          value = aws_dynamodb_table.mcp_usage_daily.name
        },
        {
          name  = "GHOST_MCP_SECRET_KMS_KEY_ARN"
          value = aws_kms_key.mcp_secrets.arn
        },
        {
          name  = "GHOST_MCP_IDC_DEVICE_FLOW_ENABLED"
          value = "true"
        },
        {
          name  = "GHOST_SUPPORT_KNOWLEDGE_BASE_NAME"
          value = "isgddocs-knowledge-base"
        },
        {
          name  = "GHOST_SUPPORT_KNOWLEDGE_BASE_ID"
          value = "MWEQITO53C"
        },
        {
          name  = "GHOST_SUPPORT_KNOWLEDGE_BASE_ACCOUNT_ID"
          value = "926182194632"
        },
        {
          name  = "GHOST_SUPPORT_KNOWLEDGE_BASE_ENVIRONMENT"
          value = "govcloud"
        },
        {
          name  = "GHOST_SUPPORT_KNOWLEDGE_BASE_REGION"
          value = "us-gov-west-1"
        },
        {
          name  = "GHOST_SUPPORT_KNOWLEDGE_BASE_MODEL_ARN"
          value = var.ghost_support_knowledge_base_model_arn
        },
        {
          name  = "ACCOUNT_NOTES_TABLE"
          value = aws_dynamodb_table.account_notes.name
        },
        {
          name  = "USER_NOTIFICATIONS_TABLE"
          value = aws_dynamodb_table.user_notifications.name
        },
        {
          name  = "NOTIFICATION_BROADCASTS_TABLE"
          value = aws_dynamodb_table.notification_broadcasts.name
        },
        {
          name  = "ACHIEVEMENT_PROGRESS_TABLE"
          value = aws_dynamodb_table.achievement_progress.name
        },
        {
          name  = "UTILIZATION_ANALYSIS_TABLE"
          value = aws_dynamodb_table.utilization_analysis.name
        },
        # SES Configuration (now managed via Site Config DynamoDB table)
        # These env vars serve as fallbacks only - primary config is in ghost-site-config table
        # To update: Use Admin Panel > System > Site Configuration > Email & Notifications
        {
          name  = "AWS_SES_FROM_EMAIL"
          value = "aws-ghost@gd-ms.com"
        },
        {
          name  = "AWS_SES_FROM_NAME"
          value = "GHOST AWS Dashboard"
        },
        {
          name  = "AWS_SES_REPLY_TO"
          value = "aws-ghost@gd-ms.com"
        },
        {
          name  = "AWS_SES_CONFIGURATION_SET"
          value = "ghost-scheduled-reports-${var.env}"
        },
        {
          name  = "AWS_SES_REGION"
          value = "us-gov-west-1"
        },
        # Scheduled Reports Configuration
        {
          name  = "SCHEDULED_REPORTS_TABLE"
          value = aws_dynamodb_table.scheduled_reports.name
        },
        {
          name  = "EMAIL_TEMPLATES_TABLE"
          value = aws_dynamodb_table.email_templates.name
        },
        {
          name  = "USER_PREFERENCES_TABLE"
          value = aws_dynamodb_table.user_preferences.name
        },
        {
          name  = "REPORT_EXECUTIONS_TABLE"
          value = aws_dynamodb_table.report_executions.name
        },
        {
          name  = "REPORT_EXECUTION_LOCKS_TABLE"
          value = aws_dynamodb_table.report_execution_locks.name
        },
        {
          name  = "SHARED_REPORTS_TABLE"
          value = aws_dynamodb_table.shared_reports.name
        },
        {
          name  = "REPORT_SCHEDULER_ENABLED"
          value = "true"
        },
        {
          name  = "REPORT_SCHEDULER_TYPE"
          value = "cron"
        },
        {
          name  = "MAX_REPORTS_PER_USER"
          value = "10"
        },
        {
          name  = "MAX_REPORTS_PER_ADMIN"
          value = "unlimited"
        },
        # S3 Storage Configuration (GovCloud)
        {
          name  = "AWS_S3_STORAGE_BUCKET"
          value = "ghost-app-storage-${var.env}"
        },
        {
          name  = "AWS_S3_STORAGE_REGION"
          value = "us-gov-west-1"
        },
        {
          name  = "AWS_S3_STORAGE_ACCOUNT_ID"
          value = "083876038518"
        },
        {
          name  = "S3_PRESIGNED_URL_EXPIRES_DAYS"
          value = "30"
        },
        # AWS Bedrock Configuration (GovCloud with Claude Sonnet 4.5)
        {
          name  = "BEDROCK_ENVIRONMENT"
          value = "govcloud"
        },
        {
          name  = "BEDROCK_REGION"
          value = "us-gov-west-1"
        },
        {
          name  = "BEDROCK_CLAUDE_MODEL_ID"
          value = "us-gov.anthropic.claude-sonnet-4-5-20250929-v1:0"
        },
        {
          name  = "BEDROCK_CLAUDE_MAX_TOKENS"
          value = "4096"
        },
        {
          name  = "BEDROCK_CLAUDE_TEMPERATURE"
          value = "0.3"
        },
        {
          name  = "BEDROCK_CLAUDE_TOP_P"
          value = "0.95"
        },
        {
          name  = "BEDROCK_CLAUDE_FALLBACK_MODELS"
          value = "anthropic.claude-3-5-sonnet-20240620-v1:0,anthropic.claude-3-sonnet-20240229-v1:0"
        },
        # Strands Agent Configuration
        {
          name  = "STRANDS_SERVER_URL"
          value = "http://internal-lz-mcp-servers-dev-alb-1428009891.us-gov-west-1.elb.amazonaws.com:80"
        },
        {
          name  = "STRANDS_TIMEOUT"
          value = "600000"
        },
        {
          name  = "STRANDS_RETRIES"
          value = "2"
        },
        {
          name  = "STRANDS_RETRY_DELAY"
          value = "2000"
        },
        # Public URLs (environment-specific)
        {
          name  = "NUXT_PUBLIC_SITE_URL"
          value = var.env == "prod" ? "https://ghost-aws.gd-ms.com" : "https://ghost-aws-dev.gd-ms.com"
        },
        {
          name  = "NUXT_PUBLIC_API_URL"
          value = var.env == "prod" ? "https://ghost-aws.gd-ms.com" : "https://ghost-aws-dev.gd-ms.com"
        }
      ],
      secrets = [
        {
          name      = "DYNAMODB_CONFIG"
          valueFrom = "${aws_secretsmanager_secret.dynamodb_config.arn}"
        },
        {
          name      = "NUXT_OIDC_PROVIDERS_ENTRA_CLIENT_ID"
          valueFrom = "${local.secret_arn}:entra_client_id::"
        },
        {
          name      = "NUXT_OIDC_PROVIDERS_ENTRA_CLIENT_SECRET"
          valueFrom = "${local.secret_arn}:entra_client_secret::"
        },
        {
          name      = "NUXT_OIDC_PROVIDERS_ENTRA_REDIRECT_URI"
          valueFrom = "${local.secret_arn}:entra_redirect_uri::"
        },
        {
          name      = "NUXT_OIDC_PROVIDERS_ENTRA_CALLBACK_REDIRECT_URL"
          valueFrom = "${local.secret_arn}:entra_callback_redirect_url::"
        },
        {
          name      = "AWS_COMMERCIAL_ACCESS_KEY_ID"
          valueFrom = "${local.secret_arn}:commercial_aws_access_key_id::"
        },
        {
          name      = "AWS_COMMERCIAL_SECRET_ACCESS_KEY"
          valueFrom = "${local.secret_arn}:commercial_aws_secret_access_key::"
        },
        {
          name      = "AWS_GOVCLOUD_ACCESS_KEY_ID"
          valueFrom = "${local.secret_arn}:govcloud_aws_access_key_id::"
        },
        {
          name      = "AWS_GOVCLOUD_SECRET_ACCESS_KEY"
          valueFrom = "${local.secret_arn}:govcloud_aws_secret_access_key::"
        },
        {
          name      = "NUXT_OIDC_TOKEN_KEY"
          valueFrom = "${local.secret_arn}:oidc_token_key::"
        },
        {
          name      = "NUXT_OIDC_SESSION_SECRET"
          valueFrom = "${local.secret_arn}:oidc_session_secret::"
        },
        {
          name      = "NUXT_OIDC_AUTH_SESSION_SECRET"
          valueFrom = "${local.secret_arn}:oidc_auth_session_secret::"
        },
        {
          name      = "GHOST_OAUTH_JWKS_JSON"
          valueFrom = "${local.secret_arn}:ghost_oauth_jwks_json::"
        },
        {
          name      = "GHOST_OAUTH_COOKIE_KEYS"
          valueFrom = "${local.secret_arn}:ghost_oauth_cookie_keys::"
        },
        {
          name      = "GHOST_MCP_REQUEST_STATE_KEY"
          valueFrom = "${local.secret_arn}:ghost_mcp_request_state_key::"
        },
      ],
      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"fetch('http://localhost:3000/api/health').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
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

# Attach autoscaling target to ECS service
resource "aws_appautoscaling_target" "ecs" {
  provider           = aws.target_deployment_account
  max_capacity       = 3
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Autoscaling policy based on average CPU
resource "aws_appautoscaling_policy" "cpu_scale" {
  provider           = aws.target_deployment_account
  name               = "cpu-target-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value = 70
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
