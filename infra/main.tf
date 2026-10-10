module "vpc" {
  source = "./modules/vpc"
}

module "rds" {
  source               = "./modules/rds"
  vpc_id               = module.vpc.vpc_id
  allowed_cidr_block   = module.vpc.private_subnets_cidr_blocks
  db_subnet_group_name = module.vpc.database_subnet_group_name
}

module "ecr" {
  source = "./modules/ecr"
}