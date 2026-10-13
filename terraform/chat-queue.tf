



resource "aws_sqs_queue" "dataset_export_jobs_dlq" {
  provider                  = aws.target_deployment_account
  name                      = "${var.app_name}-dataset-export-jobs-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "dataset_export_jobs" {
  provider                   = aws.target_deployment_account
  name                       = "${var.app_name}-dataset-export-jobs"
  visibility_timeout_seconds = 900
  message_retention_seconds  = 86400
  receive_wait_time_seconds  = 20
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dataset_export_jobs_dlq.arn
    maxReceiveCount     = 2
  })
}
