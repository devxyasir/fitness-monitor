# S3 module — recordings bucket + clips/exports bucket
# Implementation: infra phase (see 14_File_Storage_Media_Pipeline.md)

resource "aws_kms_key" "recordings_key" {
  description             = "KMS Key for ReplayCoach ${var.environment} raw recordings"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name = "replaycoach-${var.environment}-recordings-key"
  }
}

resource "aws_kms_alias" "recordings_key_alias" {
  name          = "alias/replaycoach-${var.environment}-recordings-kms-key"
  target_key_id = aws_kms_key.recordings_key.key_id
}

resource "aws_s3_bucket" "raw_recordings" {
  bucket        = "replaycoach-${var.environment}-recordings-raw"
  force_destroy = var.environment == "dev" ? true : false

  tags = {
    Name = "replaycoach-${var.environment}-recordings-raw"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "raw_recordings_sse" {
  bucket = aws_s3_bucket.raw_recordings.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.recordings_key.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "raw_recordings_block" {
  bucket = aws_s3_bucket.raw_recordings.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "raw_recordings_policy" {
  bucket = aws_s3_bucket.raw_recordings.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnforceTLSRequestsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.raw_recordings.arn,
          "${aws_s3_bucket.raw_recordings.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# IAM Role/Policy scoped for LiveKit Egress writes (Principle of Least Privilege)
resource "aws_iam_role" "livekit_egress" {
  name = "replaycoach-${var.environment}-livekit-egress-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy" "livekit_egress_policy" {
  name        = "replaycoach-${var.environment}-livekit-egress-s3-write-policy"
  description = "Allows LiveKit egress task to write to raw recordings S3 bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = [
          "${aws_s3_bucket.raw_recordings.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = [
          aws_kms_key.recordings_key.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "livekit_egress_attach" {
  role       = aws_iam_role.livekit_egress.name
  policy_arn = aws_iam_policy.livekit_egress_policy.arn
}
