resource "aws_security_group" "ecs_service" {
  provider    = aws.target_deployment_account
  name        = "${var.app_name}-ecs-service-security-group"
  description = "Security group for ECS service."
  vpc_id      = var.vpc

  ingress {
    protocol    = "tcp"
    from_port   = var.app_port
    to_port     = var.app_port
    security_groups = [aws_security_group.lb.id]   # Allow traffic from load balancer security group
  }

  egress {
      protocol    = "-1"              # All protocols
      from_port   = 0                 # All ports
      to_port     = 0
      cidr_blocks = ["0.0.0.0/0"]     # All IPs
  }
}

resource "aws_security_group" "lb" {
  provider    = aws.target_deployment_account
  name        = "${var.app_name}-load-balancer-security-group"
  description = "Security group for load balancer."
  vpc_id      = var.vpc

  ingress {
    protocol    = "tcp"
    from_port   = 443                 # HTTPS port
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
      protocol    = "-1"
      from_port   = 0
      to_port     = 0
      cidr_blocks = ["0.0.0.0/0"]
  }
}