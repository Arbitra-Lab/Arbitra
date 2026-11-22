module "primary" {
  source = "./modules/region"

  providers = {
    aws = aws.primary
  }

  project                = var.project
  environment            = var.environment
  region                 = var.primary_region
  region_key             = "primary"
  vpc_cidr               = var.vpc_cidrs["primary"]
  availability_zones     = var.availability_zones["primary"]
  api_image              = var.api_image
  api_desired_count      = var.api_desired_count
  db_instance_class      = var.db_instance_class
  db_name                = var.db_name
  db_username            = var.db_username
  db_password            = var.db_password
  redis_node_type        = var.redis_node_type
  redis_sentinel_count   = var.redis_sentinel_count
  redis_instance_count   = var.redis_instance_count
  redis_sentinel_password = var.redis_sentinel_password
  health_check_path      = var.health_check_path
  certificate_arn        = var.certificate_arn
}

module "secondary" {
  source = "./modules/region"

  providers = {
    aws = aws.secondary
  }

  project                = var.project
  environment            = var.environment
  region                 = var.secondary_region
  region_key             = "secondary"
  vpc_cidr               = var.vpc_cidrs["secondary"]
  availability_zones     = var.availability_zones["secondary"]
  api_image              = var.api_image
  api_desired_count      = var.api_desired_count
  db_instance_class      = var.db_instance_class
  db_name                = var.db_name
  db_username            = var.db_username
  db_password            = var.db_password
  redis_node_type        = var.redis_node_type
  redis_sentinel_count   = var.redis_sentinel_count
  redis_instance_count   = var.redis_instance_count
  redis_sentinel_password = var.redis_sentinel_password
  replicate_source_db    = module.primary.database_identifier
  health_check_path      = var.health_check_path
  certificate_arn        = var.certificate_arn
}

resource "aws_route53_health_check" "primary" {
  provider          = aws.primary
  fqdn              = module.primary.alb_dns_name
  port              = 443
  type              = "HTTPS"
  resource_path     = var.health_check_path
  failure_threshold = 3
  request_interval  = 30
}

resource "aws_route53_health_check" "secondary" {
  provider          = aws.primary
  fqdn              = module.secondary.alb_dns_name
  port              = 443
  type              = "HTTPS"
  resource_path     = var.health_check_path
  failure_threshold = 3
  request_interval  = 30
}

resource "aws_route53_record" "primary" {
  provider         = aws.primary
  zone_id          = var.hosted_zone_id
  name             = var.api_domain
  type             = "A"
  set_identifier   = "primary"
  failover         = "PRIMARY"
  health_check_id  = aws_route53_health_check.primary.id

  alias {
    name                   = module.primary.alb_dns_name
    zone_id                = module.primary.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "secondary" {
  provider        = aws.primary
  zone_id         = var.hosted_zone_id
  name            = var.api_domain
  type            = "A"
  set_identifier  = "secondary"
  failover        = "SECONDARY"
  health_check_id = aws_route53_health_check.secondary.id

  alias {
    name                   = module.secondary.alb_dns_name
    zone_id                = module.secondary.alb_zone_id
    evaluate_target_health = true
  }
}
