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
