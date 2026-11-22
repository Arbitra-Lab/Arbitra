variable "project" { type = string }
variable "environment" { type = string }
variable "region" { type = string }
variable "region_key" { type = string }
variable "vpc_cidr" { type = string }
variable "availability_zones" { type = list(string) }
variable "api_image" { type = string }
variable "api_desired_count" { type = number }
variable "db_instance_class" { type = string }
variable "db_name" { type = string }
variable "db_username" { type = string }

variable "db_password" {
  type      = string
  sensitive = true
}

variable "replicate_source_db" {
  description = "Set in the failover region to create a cross region read replica"
  type        = string
  default     = ""
}

variable "redis_node_type" { type = string }
variable "redis_sentinel_count" { type = number }
variable "redis_instance_count" { type = number }
variable "health_check_path" { type = string }
variable "certificate_arn" { type = string }

variable "redis_sentinel_password" {
  type      = string
  default   = ""
  sensitive = true
}
