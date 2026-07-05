variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "replaycoach"
}

variable "environment" {
  description = "Deployment environment (dev | staging | prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod"
  }
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}
