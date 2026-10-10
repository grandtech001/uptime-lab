variable "rds_name" {
  description = "The name of the RDS instance"
  type        = string
  default     = "uptime-db"
}

variable "tags" {
  type = map(string)
  default = {
    "Terraform"   = "true"
    "Environment" = "dev"
  }
}

locals {
  engine               = "postgres"
  engine_version       = "16"
  family               = "postgres16" # DB parameter group
  major_engine_version = "16"         # DB option group
  instance_class       = "db.t4g.micro"
  allocated_storage    = 20
}

variable "vpc_id" {}
variable "sg_name" {
  description = "security group name"
  type        = string
  default     = "uptime-rds-sg"
}
variable "allowed_cidr_block" {
  type = map(string)
}
variable "db_subnet_group_name" {
  type = string
}