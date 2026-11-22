output "alb_dns_name" {
  value = aws_lb.api.dns_name
}

output "alb_zone_id" {
  value = aws_lb.api.zone_id
}

output "database_identifier" {
  value = var.replicate_source_db == "" ? aws_db_instance.primary[0].identifier : aws_db_instance.replica[0].identifier
}

output "redis_endpoints" {
  value = concat(
    [aws_instance.redis_primary.private_ip],
    aws_instance.redis_replica[*].private_ip,
  )
}

output "sentinel_endpoints" {
  value = [for ip in aws_instance.sentinel[*].private_ip : "${ip}:26379"]
}
