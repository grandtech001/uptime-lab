output "repository_name" {
  value = { for k, v in module.ecr : k => v.repository_name }
}
output "db_instance_endpoint" {
  value = module.rds.db_instance_endpoint
}

output "db_instance_master_user_secret_arn" {
  value     = module.rds.db_instance_master_user_secret_arn
  sensitive = true
}
output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnets" {
  value = module.vpc.private_subnets
}

output "public_subnets" {
  value = module.vpc.public_subnets
}

output "database_subnets" {
  value = module.vpc.database_subnets
}

output "private_subnets_cidr_blocks" {
  value = module.vpc.private_subnets_cidr_blocks
}

output "database_subnet_group_name" {
  value = module.vpc.database_subnet_group_name
}
