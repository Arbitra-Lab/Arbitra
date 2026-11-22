locals {
  name_prefix = "${var.project}-${var.environment}-${var.region_key}"
  db_host     = var.replicate_source_db == "" ? aws_db_instance.primary[0].address : aws_db_instance.replica[0].address
  master_ip   = aws_instance.redis_primary[0].private_ip
}

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${local.name_prefix}-vpc" }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${local.name_prefix}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 4)
  availability_zone = var.availability_zones[count.index]

  tags = { Name = "${local.name_prefix}-private-${count.index}" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${local.name_prefix}-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name_prefix}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "api" {
  name        = "${local.name_prefix}-api-sg"
  description = "Allow public HTTPS and all outbound traffic"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "data" {
  name        = "${local.name_prefix}-data-sg"
  description = "Allow API access to Postgres, Redis and Sentinel"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }

  ingress {
    description     = "Redis"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }

  ingress {
    description     = "Sentinel"
    from_port       = 26379
    to_port         = 26379
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "primary" {
  count                  = var.replicate_source_db == "" ? 1 : 0
  identifier             = "${local.name_prefix}-db"
  engine                 = "postgres"
  engine_version         = "15.6"
  instance_class         = var.db_instance_class
  allocated_storage      = 100
  storage_encrypted      = true
  multi_az               = true
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.data.id]
  publicly_accessible    = false
  skip_final_snapshot    = false
  final_snapshot_identifier = "${local.name_prefix}-db-final"

  tags = { Name = "${local.name_prefix}-db" }
}

resource "aws_db_instance" "replica" {
  count                  = var.replicate_source_db == "" ? 0 : 1
  identifier             = "${local.name_prefix}-db-replica"
  replicate_source_db    = var.replicate_source_db
  instance_class         = var.db_instance_class
  publicly_accessible    = false
  vpc_security_group_ids = [aws_security_group.data.id]
  skip_final_snapshot    = true

  tags = { Name = "${local.name_prefix}-db-replica" }
}

resource "aws_instance" "redis_primary" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.redis_node_type
  subnet_id              = aws_subnet.private[0].id
  vpc_security_group_ids = [aws_security_group.data.id]
  user_data = templatefile("${path.module}/templates/redis.sh.tpl", {
    master_ip = ""
  })

  tags = { Name = "${local.name_prefix}-redis-primary" }
}

resource "aws_instance" "redis_replica" {
  count                  = var.redis_instance_count - 1
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.redis_node_type
  subnet_id              = aws_subnet.private[count.index % 2].id
  vpc_security_group_ids = [aws_security_group.data.id]
  user_data = templatefile("${path.module}/templates/redis.sh.tpl", {
    master_ip = local.master_ip
  })

  tags = { Name = "${local.name_prefix}-redis-replica-${count.index}" }
}

resource "aws_instance" "sentinel" {
  count                  = var.redis_sentinel_count
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.private[count.index % 2].id
  vpc_security_group_ids = [aws_security_group.data.id]
  user_data = templatefile("${path.module}/templates/sentinel.sh.tpl", {
    master_ip     = local.master_ip
    master_name   = "arbitra-primary"
    sentinel_pass = var.redis_sentinel_password
  })

  tags = { Name = "${local.name_prefix}-sentinel-${count.index}" }
}

resource "aws_lb" "api" {
  name               = substr("${local.name_prefix}-alb", 0, 32)
  internal           = false
  load_balancer_type = "application"
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.api.id]

  tags = { Name = "${local.name_prefix}-alb" }
}

resource "aws_lb_target_group" "api" {
  name        = substr("${local.name_prefix}-tg", 0, 32)
  port        = 5000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = var.health_check_path
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

data "aws_iam_policy_document" "execution_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.name_prefix}-execution"
  assume_role_policy = data.aws_iam_policy_document.execution_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name_prefix}-api"
  retention_in_days = 30
}

resource "aws_ecs_cluster" "api" {
  name = "${local.name_prefix}-cluster"
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name_prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.api_image
      essential = true

      portMappings = [
        { containerPort = 5000, protocol = "tcp" }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "5000" },
        { name = "DB_HOST", value = local.db_host },
        { name = "REDIS_MODE", value = "sentinel" },
        {
          name  = "REDIS_SENTINELS"
          value = join(",", [for ip in aws_instance.sentinel[*].private_ip : "${ip}:26379"])
        },
        { name = "REDIS_SENTINEL_MASTER_NAME", value = "arbitra-primary" },
        { name = "REDIS_SENTINEL_PASSWORD", value = var.redis_sentinel_password }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "api" {
  name            = "${local.name_prefix}-api"
  cluster         = aws_ecs_cluster.api.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 5000
  }

  depends_on = [aws_lb_listener.https]
}
