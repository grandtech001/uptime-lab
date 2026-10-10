variable "repository_name" {
  description = "Name of ECR"
  type        = string
  default     = "uptimelab"
}

variable "tags" {
  type = map(string)
  default = {
    "Terraform"   = "true"
    "Environment" = "dev"
  }
}

