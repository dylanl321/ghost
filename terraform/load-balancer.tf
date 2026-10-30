resource "aws_lb" "main" {
  provider           = aws.target_deployment_account
  name               = "${var.app_name}-lb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.lb.id]
  subnets            = var.subnets
  idle_timeout       = 600 # 10 minutes - increased for long-running AI queries
}

resource "aws_lb_listener" "main" {
  provider          = aws.target_deployment_account
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = data.aws_acm_certificate.cert.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }
}

resource "aws_lb_target_group" "main" {
  provider    = aws.target_deployment_account
  name        = "${var.app_name}-lb-tg"
  port        = var.app_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc

  health_check {
    path                = "/api/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
    matcher             = "200"
  }

  # Stopgap until OIDC sessions move to shared storage: nuxt-oidc-auth keeps
  # each user's tokens in the memory of the task that handled their login, so
  # once autoscaling runs a second task, requests routed to it come back 401.
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }

  lifecycle {
    create_before_destroy = true
  }
}
