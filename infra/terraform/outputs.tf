output "primary_alb" {
  value = module.primary.alb_dns_name
}

output "secondary_alb" {
  value = module.secondary.alb_dns_name
}

output "primary_database" {
  value = module.primary.database_identifier
}

output "secondary_database" {
  value = module.secondary.database_identifier
}

output "primary_sentinel_endpoints" {
  value = module.primary.sentinel_endpoints
}

output "secondary_sentinel_endpoints" {
  value = module.secondary.sentinel_endpoints
}
