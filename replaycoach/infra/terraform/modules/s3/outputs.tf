output "raw_recordings_bucket_name" {
  description = "The name of the S3 bucket for raw recordings"
  value       = aws_s3_bucket.raw_recordings.id
}

output "raw_recordings_bucket_arn" {
  description = "The ARN of the S3 bucket for raw recordings"
  value       = aws_s3_bucket.raw_recordings.arn
}

output "livekit_egress_role_arn" {
  description = "The ARN of the IAM role for LiveKit egress"
  value       = aws_iam_role.livekit_egress.arn
}
