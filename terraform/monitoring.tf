# SNS Topic for CloudWatch Alerts
resource "aws_sns_topic" "alerts" {
  provider = aws.target_deployment_account
  name     = "${var.app_name}-alerts"

  tags = {
    Application = var.app_name
  }
}

# SNS Topic Subscription - Email notification
resource "aws_sns_topic_subscription" "alerts_email" {
  provider  = aws.target_deployment_account
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.admin_notification_emails
}

# CloudWatch Alarm: CPU High
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-cpu-high"
  alarm_description   = "CPU utilization exceeded 80% for 10 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.main.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

# CloudWatch Alarm: Memory High
resource "aws_cloudwatch_metric_alarm" "memory_high" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-memory-high"
  alarm_description   = "Memory utilization exceeded 85% for 10 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 85

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.main.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

# CloudWatch Alarm: 5XX Errors
resource "aws_cloudwatch_metric_alarm" "target_5xx_errors" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-target-5xx-errors"
  alarm_description   = "Target 5XX errors exceeded 10 in 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.main.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

# CloudWatch Alarm: Unhealthy Hosts
resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-unhealthy-hosts"
  alarm_description   = "One or more targets are unhealthy"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 0

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.main.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

# =============================================================================
# Application-Level Observability
# Log Metric Filters, Alarms, Saved Queries, and Dashboard
# =============================================================================

# --- CloudWatch Log Metric Filters ---
# Extract structured JSON fields from application logs into CloudWatch metrics.
# No SDK calls or IAM changes required — metric filters run server-side in CloudWatch.

resource "aws_cloudwatch_log_metric_filter" "api_latency" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-api-latency"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"request\" }"

  metric_transformation {
    name      = "APILatencyMs"
    namespace = "${var.app_name}/Application"
    value     = "$.durationMs"
  }
}

resource "aws_cloudwatch_log_metric_filter" "api_request_count" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-api-request-count"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"request\" }"

  metric_transformation {
    name          = "APIRequestCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "api_5xx" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-api-5xx"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"request\" && $.statusCode >= 500 }"

  metric_transformation {
    name          = "API5xxCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

# Recurring 5xx from the Inspector findings endpoint specifically. Provider calls
# there fail as a burst (STS succeeds, upstream errors), so a dedicated filter on
# the exact normalized request path isolates it from unrelated 5xx noise.
resource "aws_cloudwatch_log_metric_filter" "inspector_findings_5xx" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-inspector-findings-5xx"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"request\" && $.path = \"/api/v1/security/inspector/findings\" && $.statusCode >= 500 }"

  metric_transformation {
    name          = "InspectorFindings5xxCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

# Credential failures can leave the task alive while most AWS-backed pages fail.
resource "aws_cloudwatch_log_metric_filter" "aws_credential_failure" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-aws-credential-failure"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "\"The security token included in the request is invalid\""

  metric_transformation {
    name          = "AWSCredentialFailureCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "job_failure" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-job-failure"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"job\" && $.status = \"error\" }"

  metric_transformation {
    name          = "JobFailureCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "job_duration" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-job-duration"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"job\" }"

  metric_transformation {
    name      = "JobDurationMs"
    namespace = "${var.app_name}/Application"
    value     = "$.durationMs"
  }
}

resource "aws_cloudwatch_log_metric_filter" "api_latency_during_jobs" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-api-latency-during-jobs"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"request\" && $.backgroundJobActive IS TRUE }"

  metric_transformation {
    name      = "APILatencyDuringJobsMs"
    namespace = "${var.app_name}/Application"
    value     = "$.durationMs"
  }
}

# --- Application-Level Alarms ---

resource "aws_cloudwatch_metric_alarm" "api_p95_latency" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-api-p95-latency-high"
  alarm_description   = "API p95 latency exceeded 5 seconds for 10 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "APILatencyMs"
  namespace           = "${var.app_name}/Application"
  period              = 300
  extended_statistic  = "p95"
  threshold           = 5000
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

resource "aws_cloudwatch_metric_alarm" "api_5xx_errors" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-api-5xx-errors"
  alarm_description   = "Application-level API 5XX errors exceeded 5 in 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "API5xxCount"
  namespace           = "${var.app_name}/Application"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

resource "aws_cloudwatch_metric_alarm" "aws_credential_failures" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-aws-credential-failures"
  alarm_description   = "AWS rejected the application's configured credentials"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "AWSCredentialFailureCount"
  namespace           = "${var.app_name}/Application"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

resource "aws_cloudwatch_metric_alarm" "inspector_findings_5xx" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-inspector-findings-5xx"
  alarm_description   = "Inspector findings endpoint returned 5xx at least 3 times in 5 minutes — recurring provider failure, not a single transient error"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "InspectorFindings5xxCount"
  namespace           = "${var.app_name}/Application"
  period              = 300
  statistic           = "Sum"
  threshold           = 3
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

resource "aws_cloudwatch_metric_alarm" "job_failures" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-job-failures"
  alarm_description   = "Background job failures exceeded 3 in 15 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "JobFailureCount"
  namespace           = "${var.app_name}/Application"
  period              = 900
  statistic           = "Sum"
  threshold           = 3
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

resource "aws_cloudwatch_metric_alarm" "job_duration_high" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-job-duration-high"
  alarm_description   = "Background job duration exceeded 10 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "JobDurationMs"
  namespace           = "${var.app_name}/Application"
  period              = 300
  statistic           = "Maximum"
  threshold           = 600000
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

# --- Saved CloudWatch Log Insights Queries ---

resource "aws_cloudwatch_query_definition" "slowest_endpoints" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/Slowest Endpoints"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    fields @timestamp, path, method, durationMs, statusCode
    | filter type = "request"
    | sort durationMs desc
    | limit 25
  EOT
}

resource "aws_cloudwatch_query_definition" "api_latency_percentiles" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/API Latency Percentiles"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter type = "request"
    | stats avg(durationMs) as avg_ms,
            pct(durationMs, 50) as p50,
            pct(durationMs, 95) as p95,
            pct(durationMs, 99) as p99,
            count(*) as requests
      by bin(5m)
  EOT
}

resource "aws_cloudwatch_query_definition" "latency_during_vs_outside_jobs" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/Latency During Jobs vs Normal"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter type = "request"
    | stats avg(durationMs) as avg_ms,
            pct(durationMs, 50) as p50,
            pct(durationMs, 95) as p95,
            count(*) as requests
      by backgroundJobActive
  EOT
}

resource "aws_cloudwatch_query_definition" "latency_by_active_job" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/Latency by Active Job"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter type = "request" and backgroundJobActive = 1
    | stats avg(durationMs) as avg_ms,
            pct(durationMs, 95) as p95,
            count(*) as requests
      by activeJobs
  EOT
}

resource "aws_cloudwatch_query_definition" "background_job_durations" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/Background Job Durations"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter type = "job"
    | stats avg(durationMs) as avg_ms,
            max(durationMs) as max_ms,
            count(*) as runs,
            sum(status = "error") as failures
      by job
  EOT
}

resource "aws_cloudwatch_query_definition" "error_frequency" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/Error Frequency"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter level = "error" or level = "fatal"
    | stats count(*) as errors by bin(15m)
    | sort @timestamp desc
  EOT
}

resource "aws_cloudwatch_query_definition" "top_error_signatures" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/Top Error Signatures"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  # Structured-field query: matches lowercase logger severities (level = "error"
  # or "fatal") and structured API error events (type = "api_error"), since raw
  # @message never contains uppercase "ERROR". Grouping keys are bounded,
  # low-cardinality signature fields — requestId is surfaced in detail via an
  # example only, so recurring signatures collapse into one row instead of
  # exploding into per-request cardinality.
  query_string = <<-EOT
    filter level = "error" or level = "fatal" or type = "api_error"
    | stats count(*) as occurrences,
            earliest(@timestamp) as first_seen,
            latest(@timestamp) as last_seen,
            max(requestId) as example_requestId
      by level, type, errorName, statusCode, path, message
    | sort occurrences desc
    | limit 50
  EOT
}

resource "aws_cloudwatch_query_definition" "errors_by_endpoint" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/5XX Errors by Endpoint"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter type = "request" and statusCode >= 500
    | stats count(*) as errors by path, statusCode
    | sort errors desc
    | limit 20
  EOT
}

resource "aws_cloudwatch_query_definition" "slowest_by_average" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/Slowest Endpoints by Average"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter type = "request"
    | stats avg(durationMs) as avg_ms,
            pct(durationMs, 95) as p95,
            count(*) as requests
      by path
    | filter requests > 5
    | sort p95 desc
    | limit 20
  EOT
}

# --- CloudWatch Dashboard ---

# =============================================================================
# Container Insights & Custom Metric Logging
# ECS Container Insights provides CPU, Memory, Network, and Storage metrics
# at the task and service level. Custom metric filters below extract
# additional application-level metrics from structured logs.
# =============================================================================

# Log group for Container Insights performance metrics
resource "aws_cloudwatch_log_group" "container_insights" {
  provider          = aws.target_deployment_account
  name              = "/aws/ecs/containerinsights/${var.app_name}/performance"
  retention_in_days = 30

  tags = {
    Application = var.app_name
    Environment = var.env
  }
}

# --- Custom Application Metric Filters ---
# These extract EMF-style metrics from application logs for fine-grained observability

# Track authentication events
resource "aws_cloudwatch_log_metric_filter" "auth_success" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-auth-success"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"auth\" && $.status = \"success\" }"

  metric_transformation {
    name          = "AuthSuccessCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "auth_failure" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-auth-failure"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"auth\" && $.status = \"failure\" }"

  metric_transformation {
    name          = "AuthFailureCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

# Track DynamoDB operation latencies
resource "aws_cloudwatch_log_metric_filter" "dynamodb_latency" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-dynamodb-latency"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"dynamodb\" }"

  metric_transformation {
    name      = "DynamoDBLatencyMs"
    namespace = "${var.app_name}/Application"
    value     = "$.durationMs"
  }
}

# Track DynamoDB throttles
resource "aws_cloudwatch_log_metric_filter" "dynamodb_throttle" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-dynamodb-throttle"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"dynamodb\" && $.error = \"ThrottlingException\" }"

  metric_transformation {
    name          = "DynamoDBThrottleCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

# Track Bedrock AI invocation latency
resource "aws_cloudwatch_log_metric_filter" "bedrock_latency" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-bedrock-latency"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"bedrock\" }"

  metric_transformation {
    name      = "BedrockLatencyMs"
    namespace = "${var.app_name}/Application"
    value     = "$.durationMs"
  }
}

# Track Bedrock token usage
resource "aws_cloudwatch_log_metric_filter" "bedrock_tokens" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-bedrock-tokens"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"bedrock\" && $.totalTokens > 0 }"

  metric_transformation {
    name      = "BedrockTokensUsed"
    namespace = "${var.app_name}/Application"
    value     = "$.totalTokens"
  }
}

# Bedrock pricing catalog fetch failures (emitted once per region/backoff window)
resource "aws_cloudwatch_log_metric_filter" "bedrock_pricing_catalog_failure" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-bedrock-pricing-catalog-failure"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "\"[AI Usage] Bedrock pricing catalog fetch failed\""

  metric_transformation {
    name          = "BedrockPricingCatalogFailureCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

# Track SES email sends
resource "aws_cloudwatch_log_metric_filter" "email_sent" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-email-sent"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"email\" && $.status = \"sent\" }"

  metric_transformation {
    name          = "EmailSentCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

# Track active concurrent users (from session logs)
resource "aws_cloudwatch_log_metric_filter" "active_sessions" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-active-sessions"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"session\" && $.event = \"created\" }"

  metric_transformation {
    name          = "SessionCreatedCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

# Track report generation
resource "aws_cloudwatch_log_metric_filter" "report_generated" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-report-generated"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"report\" && $.status = \"completed\" }"

  metric_transformation {
    name          = "ReportGeneratedCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "report_duration" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-report-duration"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"report\" }"

  metric_transformation {
    name      = "ReportDurationMs"
    namespace = "${var.app_name}/Application"
    value     = "$.durationMs"
  }
}

# --- Alarms for New Metrics ---

resource "aws_cloudwatch_metric_alarm" "auth_failures_high" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-auth-failures-high"
  alarm_description   = "Authentication failures exceeded 20 in 5 minutes — possible brute force"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "AuthFailureCount"
  namespace           = "${var.app_name}/Application"
  period              = 300
  statistic           = "Sum"
  threshold           = 20
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_throttles" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-dynamodb-throttles"
  alarm_description   = "DynamoDB throttling events detected — review table capacity"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "DynamoDBThrottleCount"
  namespace           = "${var.app_name}/Application"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

resource "aws_cloudwatch_metric_alarm" "bedrock_latency_high" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-bedrock-latency-high"
  alarm_description   = "Bedrock AI response p95 latency exceeded 30 seconds"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "BedrockLatencyMs"
  namespace           = "${var.app_name}/Application"
  period              = 300
  extended_statistic  = "p95"
  threshold           = 30000
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

resource "aws_cloudwatch_metric_alarm" "bedrock_pricing_catalog_failures" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-bedrock-pricing-catalog-failures"
  alarm_description   = "Bedrock pricing catalog fetch failed; AI usage cost estimates fall back to zero"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BedrockPricingCatalogFailureCount"
  namespace           = "${var.app_name}/Application"
  period              = 3600
  statistic           = "Sum"
  threshold           = 2
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

# --- Saved Queries for New Metrics ---

resource "aws_cloudwatch_query_definition" "auth_events" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/Authentication Events"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter type = "auth"
    | stats count(*) as attempts,
            sum(status = "success") as successes,
            sum(status = "failure") as failures
      by bin(15m)
  EOT
}

resource "aws_cloudwatch_query_definition" "dynamodb_performance" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/DynamoDB Performance"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter type = "dynamodb"
    | stats avg(durationMs) as avg_ms,
            pct(durationMs, 95) as p95_ms,
            max(durationMs) as max_ms,
            count(*) as operations
      by table, operation
    | sort p95_ms desc
  EOT
}

resource "aws_cloudwatch_query_definition" "bedrock_usage" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/Bedrock AI Usage"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter type = "bedrock"
    | stats avg(durationMs) as avg_latency_ms,
            pct(durationMs, 95) as p95_latency_ms,
            sum(totalTokens) as total_tokens,
            count(*) as invocations
      by bin(1h)
  EOT
}

resource "aws_cloudwatch_query_definition" "report_performance" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/Report Generation Performance"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter type = "report"
    | stats avg(durationMs) as avg_ms,
            max(durationMs) as max_ms,
            count(*) as reports,
            sum(status = "error") as failures
      by reportType
    | sort avg_ms desc
  EOT
}

# --- Dashboard Addition: Container Insights & Application Metrics ---

resource "aws_cloudwatch_dashboard" "main" {
  provider       = aws.target_deployment_account
  dashboard_name = var.app_name

  dashboard_body = jsonencode({
    widgets = [
      # Row 1: API Latency (full width)
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 24
        height = 6
        properties = {
          title  = "API Latency (ms)"
          region = local.child_region
          metrics = [
            ["${var.app_name}/Application", "APILatencyMs", { stat = "p50", label = "p50" }],
            ["...", { stat = "p95", label = "p95" }],
            ["...", { stat = "p99", label = "p99" }],
          ]
          period = 300
          view   = "timeSeries"
          yAxis = {
            left = { min = 0, label = "ms" }
          }
        }
      },

      # Row 2 Left: Request Count
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "API Request Count"
          region = local.child_region
          metrics = [
            ["${var.app_name}/Application", "APIRequestCount", { stat = "Sum", label = "Requests" }],
          ]
          period = 300
          view   = "timeSeries"
          yAxis = {
            left = { min = 0 }
          }
        }
      },

      # Row 2 Right: 5XX Error Count
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "API 5XX Errors"
          region = local.child_region
          metrics = [
            ["${var.app_name}/Application", "API5xxCount", { stat = "Sum", label = "5XX Errors", color = "#d13212" }],
          ]
          period = 300
          view   = "timeSeries"
          yAxis = {
            left = { min = 0 }
          }
        }
      },

      # Row 3: Job Impact on API Latency (full width — the key widget)
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 24
        height = 6
        properties = {
          title  = "Background Job Impact on API Latency"
          region = local.child_region
          metrics = [
            ["${var.app_name}/Application", "JobDurationMs", { stat = "Average", label = "Job Duration (avg)", yAxis = "right" }],
            ["${var.app_name}/Application", "APILatencyDuringJobsMs", { stat = "p95", label = "API p95 During Jobs", color = "#d13212" }],
            ["${var.app_name}/Application", "APILatencyMs", { stat = "p95", label = "API p95 Overall", color = "#1f77b4" }],
          ]
          period = 300
          view   = "timeSeries"
          yAxis = {
            left  = { min = 0, label = "API Latency (ms)" }
            right = { min = 0, label = "Job Duration (ms)" }
          }
        }
      },

      # Row 4 Left: Job Failures
      {
        type   = "metric"
        x      = 0
        y      = 18
        width  = 12
        height = 6
        properties = {
          title  = "Background Job Failures"
          region = local.child_region
          metrics = [
            ["${var.app_name}/Application", "JobFailureCount", { stat = "Sum", label = "Failures", color = "#d13212" }],
          ]
          period = 900
          view   = "timeSeries"
          yAxis = {
            left = { min = 0 }
          }
        }
      },

      # Row 4 Right: ECS CPU & Memory
      {
        type   = "metric"
        x      = 12
        y      = 18
        width  = 12
        height = 6
        properties = {
          title  = "ECS CPU & Memory Utilization"
          region = local.child_region
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.main.name, { stat = "Average", label = "CPU %" }],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.main.name, { stat = "Average", label = "Memory %" }],
          ]
          period = 300
          view   = "timeSeries"
          yAxis = {
            left = { min = 0, max = 100, label = "%" }
          }
        }
      },

      # Row 5: ALB Target Response Time (full width)
      {
        type   = "metric"
        x      = 0
        y      = 24
        width  = 24
        height = 6
        properties = {
          title  = "ALB Target Response Time"
          region = local.child_region
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.main.arn_suffix, "TargetGroup", aws_lb_target_group.main.arn_suffix, { stat = "p50", label = "p50" }],
            ["...", { stat = "p95", label = "p95" }],
          ]
          period = 300
          view   = "timeSeries"
          yAxis = {
            left = { min = 0, label = "seconds" }
          }
        }
      },

      # Row 6 Left: DynamoDB Latency
      {
        type   = "metric"
        x      = 0
        y      = 30
        width  = 12
        height = 6
        properties = {
          title  = "DynamoDB Latency (ms)"
          region = local.child_region
          metrics = [
            ["${var.app_name}/Application", "DynamoDBLatencyMs", { stat = "Average", label = "Average" }],
            ["...", { stat = "p95", label = "p95" }],
          ]
          period = 300
          view   = "timeSeries"
          yAxis = {
            left = { min = 0, label = "ms" }
          }
        }
      },

      # Row 6 Right: Bedrock AI Latency & Tokens
      {
        type   = "metric"
        x      = 12
        y      = 30
        width  = 12
        height = 6
        properties = {
          title  = "Bedrock AI Latency & Token Usage"
          region = local.child_region
          metrics = [
            ["${var.app_name}/Application", "BedrockLatencyMs", { stat = "Average", label = "Latency (avg ms)" }],
            ["${var.app_name}/Application", "BedrockTokensUsed", { stat = "Sum", label = "Tokens Used", yAxis = "right" }],
          ]
          period = 300
          view   = "timeSeries"
          yAxis = {
            left  = { min = 0, label = "ms" }
            right = { min = 0, label = "tokens" }
          }
        }
      },

      # Row 7 Left: Authentication Events
      {
        type   = "metric"
        x      = 0
        y      = 36
        width  = 12
        height = 6
        properties = {
          title  = "Authentication Events"
          region = local.child_region
          metrics = [
            ["${var.app_name}/Application", "AuthSuccessCount", { stat = "Sum", label = "Successes", color = "#2ca02c" }],
            ["${var.app_name}/Application", "AuthFailureCount", { stat = "Sum", label = "Failures", color = "#d13212" }],
          ]
          period = 300
          view   = "timeSeries"
          yAxis = {
            left = { min = 0 }
          }
        }
      },

      # Row 7 Right: Sessions & Reports
      {
        type   = "metric"
        x      = 12
        y      = 36
        width  = 12
        height = 6
        properties = {
          title  = "Sessions & Reports Generated"
          region = local.child_region
          metrics = [
            ["${var.app_name}/Application", "SessionCreatedCount", { stat = "Sum", label = "Sessions", color = "#1f77b4" }],
            ["${var.app_name}/Application", "ReportGeneratedCount", { stat = "Sum", label = "Reports", color = "#ff7f0e" }],
            ["${var.app_name}/Application", "EmailSentCount", { stat = "Sum", label = "Emails Sent", color = "#9467bd" }],
          ]
          period = 300
          view   = "timeSeries"
          yAxis = {
            left = { min = 0 }
          }
        }
      },

      # Row 8: Container Insights - Network I/O (full width)
      {
        type   = "metric"
        x      = 0
        y      = 42
        width  = 24
        height = 6
        properties = {
          title  = "Container Network I/O"
          region = local.child_region
          metrics = [
            ["ECS/ContainerInsights", "NetworkRxBytes", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.main.name, { stat = "Average", label = "RX Bytes" }],
            ["ECS/ContainerInsights", "NetworkTxBytes", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.main.name, { stat = "Average", label = "TX Bytes" }],
          ]
          period = 300
          view   = "timeSeries"
          yAxis = {
            left = { min = 0, label = "bytes" }
          }
        }
      },
    ]
  })
}

# Hosted MCP protocol and authorization telemetry.
resource "aws_cloudwatch_log_metric_filter" "mcp_request_count" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-mcp-request-count"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"mcp_request\" }"

  metric_transformation {
    name          = "MCPRequestCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "mcp_error_count" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-mcp-error-count"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"mcp_request\" && $.statusCode >= 400 }"

  metric_transformation {
    name          = "MCPErrorCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "mcp_oauth_refresh_failure" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-mcp-oauth-refresh-failure"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"mcp_oauth\" && $.event = \"refresh\" && $.status = \"failure\" }"

  metric_transformation {
    name          = "MCPOAuthRefreshFailureCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "mcp_latency" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-mcp-latency"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.type = \"mcp_request\" }"

  metric_transformation {
    name      = "MCPLatencyMs"
    namespace = "${var.app_name}/Application"
    value     = "$.durationMs"
  }
}

resource "aws_cloudwatch_metric_alarm" "mcp_errors_high" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-mcp-errors-high"
  alarm_description   = "MCP authorization or protocol errors exceeded 20 in 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "MCPErrorCount"
  namespace           = "${var.app_name}/Application"
  period              = 300
  statistic           = "Sum"
  threshold           = 20
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "mcp_oauth_refresh_failures" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-mcp-oauth-refresh-failures"
  alarm_description   = "GHOST MCP OAuth refresh failures exceeded 5 in 15 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "MCPOAuthRefreshFailureCount"
  namespace           = "${var.app_name}/Application"
  period              = 900
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_query_definition" "mcp_oauth_refresh_failures" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/MCP OAuth Refresh Failures"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    fields @timestamp, status, reason
    | filter type = "mcp_oauth" and event = "refresh"
    | stats count(*) as attempts,
            sum(status = "success") as successes,
            sum(status = "failure") as failures
      by reason, bin(15m)
    | sort @timestamp desc
  EOT
}

# Authoritative cost queries reject requests missing UnblendedCost, surfacing as
# sparse HTTP 500s that fall under the ALB target-5xx alarm threshold. Alarm on
# the exact validation signature so any occurrence pages immediately.
resource "aws_cloudwatch_log_metric_filter" "cost_query_validation_failure" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-cost-query-validation-failure"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "\"UnblendedCost is required for authoritative cost queries\""

  metric_transformation {
    name          = "CostQueryValidationFailureCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "cost_query_validation_failures" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-cost-query-validation-failures"
  alarm_description   = "Cost query validation failures detected — authoritative query missing UnblendedCost"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CostQueryValidationFailureCount"
  namespace           = "${var.app_name}/Application"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

resource "aws_cloudwatch_query_definition" "api_5xx_by_endpoint_binned" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/API 5XX Counts by Endpoint (5m)"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter type = "request" and statusCode >= 500
    | stats count(*) as errors,
            avg(durationMs) as avg_ms,
            pct(durationMs, 95) as p95_ms
      by method, path, bin(5m) as window
    | sort window desc
  EOT
}

# Count structured application records logged at error or fatal level.
resource "aws_cloudwatch_log_metric_filter" "application_errors" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-application-errors"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.level = \"error\" || $.level = \"fatal\" }"

  metric_transformation {
    name          = "ApplicationErrorCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "application_errors_high" {
  provider            = aws.target_deployment_account
  alarm_name          = "${var.app_name}-application-errors-high"
  alarm_description   = "Application error/fatal log records exceeded 5 in 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApplicationErrorCount"
  namespace           = "${var.app_name}/Application"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Application = var.app_name
  }
}

resource "aws_cloudwatch_query_definition" "error_signatures" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/Application Error Signatures"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter level in ["error", "fatal"]
    | stats count(*) as occurrences by level, message
    | sort occurrences desc
    | limit 25
  EOT
}

# CloudWatch GetMetricData throttling retries emitted by
# server/utils/cloudwatch-metrics.ts as warn-level logs with a stable message
# prefix. Counting them surfaces throttle pressure as a metric for trend
# analysis. No alarm is defined here on purpose: a meaningful threshold needs a
# production baseline and human review before paging.
resource "aws_cloudwatch_log_metric_filter" "cloudwatch_metrics_throttle" {
  provider       = aws.target_deployment_account
  name           = "${var.app_name}-cloudwatch-metrics-throttle"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "\"[CloudWatch Metrics] Throttled on batch\""

  metric_transformation {
    name          = "CloudWatchMetricThrottleCount"
    namespace     = "${var.app_name}/Application"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_query_definition" "cloudwatch_metrics_throttle" {
  provider        = aws.target_deployment_account
  name            = "${var.app_name}/CloudWatch Metrics Throttle Retries"
  log_group_names = [aws_cloudwatch_log_group.ecs.name]

  query_string = <<-EOT
    filter message like /\[CloudWatch Metrics\] Throttled on batch/
    | stats count(*) as retries by bin(15m)
    | sort @timestamp desc
  EOT
}
