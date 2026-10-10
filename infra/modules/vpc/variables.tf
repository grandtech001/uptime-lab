variable "tags" {
  type = map(string)
  default = {
    "Terraform"   = "true"
    "Environment" = "dev"

  }
}

variable "vpc_name" {
  description = "Name of the VPC"
  type        = string
  default     = "uptime-vpc"
}

variable "cidr" {
  description = "cidr block for vpc network"
  type        = string
  default     = "10.0.0.0/16"

}

variable "azs" {
  description = "List of Availability Zones"
  type        = list(string)
  default     = ["eu-west-2a", "eu-west-2b"]

}

variable "public_subnets" {
  description = "List of public subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]

}

variable "private_subnets" {
  description = "List of private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]

}

variable "database_subnets" {
  description = "List of database subnets"
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24"]
}