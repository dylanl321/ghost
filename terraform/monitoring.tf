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
    ]
  })
}
