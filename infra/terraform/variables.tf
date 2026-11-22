variable "primary_region" {
  description = "AWS region that serves normal traffic and owns the writable database"
  type        = string
  default     = "us-east-1"
}

variable "secondary_region" {
  description = "AWS region that serves failover traffic and hosts the read replica"
  type        = string
  default     = "us-west-2"
}

variable "project" {
  description = "Prefix applied to every resource name"
  type        = string
  default     = "arbitra"
}

variable "environment" {
  description = "Deployment environment label"
  type        = string
  default     = "production"
}

variable "vpc_cidrs" {
  description = "CIDR blocks indexed by region key"
  type = map(string)
  default = {
    primary   = "10.10.0.0/16"
    secondary = "10.20.0.0/16"
  }
}

variable "availability_zones" {
  description = "Two availability zones per region"
  type = map(list(string))
  default = {
    primary   = ["us-east-1a", "us-east-1b"]
    secondary = ["us-west-2a", "us-west-2b"]
  }
}

variable "api_image" {
  description = "Container image for the API service"
  type        = string
  default     = "ghcr.io/arbitra-lab/arbitra-api:latest"
}

variable "api_desired_count" {
  description = "API tasks per region"
  type        = number
  default     = 2
}

variable "db_instance_class" {
  description = "RDS instance size"
  type        = string
  default     = "db.t3.medium"
}

variable "db_name" {
  description = "Application database name"
  type        = string
  default     = "arbitra"
}

variable "db_username" {
  description = "Database administrator username"
  type        = string
  default     = "arbitra"
}

variable "db_password" {
  description = "Database administrator password, supplied at apply time"
  type        = string
  sensitive   = true
}

variable "redis_node_type" {
  description = "Redis instance size"
  type        = string
  default     = "t3.small"
}

variable "redis_sentinel_count" {
  description = "Number of Sentinel instances in each region"
  type        = number
  default     = 3

  validation {
    condition     = var.redis_sentinel_count >= 3
    error_message = "At least three sentinels are required for quorum based failover"
  }
}

variable "redis_instance_count" {
  description = "Redis data nodes per region, one primary and at least one replica"
  type        = number
  default     = 2

  validation {
    condition     = var.redis_instance_count >= 2
    error_message = "At least two Redis nodes are required for failover"
  }
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone that owns the API domain"
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate ARN used by both regional load balancers"
  type        = string
}

variable "redis_sentinel_password" {
  description = "Optional Sentinel password shared by all nodes"
  type        = string
  default     = ""
  sensitive   = true
}

variable "api_domain" {
  description = "Public DNS name for the API"
  type        = string
  default     = "api.arbitra.app"
}

variable "health_check_path" {
  description = "HTTP path used by Route53 and load balancers"
  type        = string
  default     = "/health"
}
