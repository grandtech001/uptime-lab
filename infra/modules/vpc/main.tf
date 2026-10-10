module "vpc" {
  source = "terraform-aws-modules/vpc/aws"

  version = "6.7.3"

  name = var.vpc_name
  cidr = var.cidr

  azs                                = var.azs
  private_subnets                    = var.private_subnets
  public_subnets                     = var.public_subnets
  database_subnets                   = var.database_subnets
  create_database_subnet_group       = true
  create_database_subnet_route_table = true

  enable_nat_gateway = true
  enable_vpn_gateway = false
  single_nat_gateway = true

  tags = var.tags

  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
}
