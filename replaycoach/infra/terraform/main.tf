terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state backend — enable for staging/prod workspaces.
  # Create the S3 bucket and DynamoDB table manually before first apply.
  # backend "s3" {
  #   bucket         = "replaycoach-terraform-state"
  #   key            = "global/s3/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "replaycoach-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ── Module calls (wired up in later phases) ───────────────────────────────────
# module "ecs" {
#   source      = "./modules/ecs"
#   project     = var.project_name
#   environment = var.environment
# }
#
# module "rds" {
#   source      = "./modules/rds"
#   project     = var.project_name
#   environment = var.environment
# }
#
# module "elasticache" {
#   source      = "./modules/elasticache"
#   project     = var.project_name
#   environment = var.environment
# }
#
module "s3" {
  source      = "./modules/s3"
  project     = var.project_name
  environment = var.environment
}

# module "cloudfront" {
#   source      = "./modules/cloudfront"
#   project     = var.project_name
#   environment = var.environment
# }
