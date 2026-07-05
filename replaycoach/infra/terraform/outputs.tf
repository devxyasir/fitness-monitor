# Outputs are populated once modules are wired up (infra phase).
# Placeholder structure only.

# output "api_ecr_repository_url" {
#   description = "ECR repository URL for the Core API Docker image"
#   value       = module.ecs.api_ecr_repository_url
# }

# output "rds_endpoint" {
#   description = "PostgreSQL RDS endpoint"
#   value       = module.rds.endpoint
#   sensitive   = true
# }

# output "redis_endpoint" {
#   description = "ElastiCache Redis endpoint"
#   value       = module.elasticache.endpoint
#   sensitive   = true
# }

# output "s3_recordings_bucket" {
#   description = "S3 bucket name for session recordings"
#   value       = module.s3.recordings_bucket_name
# }

# output "cloudfront_distribution_domain" {
#   description = "CloudFront distribution domain for recording playback"
#   value       = module.cloudfront.distribution_domain
# }
