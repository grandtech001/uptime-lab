resource "aws_security_group" "rds" {
  name   = var.sg_name
  vpc_id = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "rds" {
  for_each          = toset(var.allowed_cidr_block)
  security_group_id = aws_security_group.rds.id
  cidr_ipv4         = each.value
  from_port         = 5432
  ip_protocol       = "tcp"
  to_port           = 5432
}
module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "7.2.2"

  identifier = var.rds_name


  create_db_option_group    = false
  create_db_parameter_group = false

  # All available versions: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html#PostgreSQL.Concepts
  engine               = local.engine
  engine_version       = local.engine_version
  family               = local.family               # DB parameter group
  major_engine_version = local.major_engine_version # DB option group
  instance_class       = local.instance_class

  allocated_storage = local.allocated_storage

  # NOTE: Do NOT use 'user' as the value for 'username' as it throws:
  # "Error creating DB Instance: InvalidParameterValue: MasterUsername
  # user cannot be used as it is a reserved word used by the engine"
  db_name  = "uptime"
  username = "uptime"
  port     = 5432

  db_subnet_group_name   = var.db_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]

  maintenance_window              = "Mon:00:00-Mon:03:00"
  backup_window                   = "03:00-06:00"
  backup_retention_period         = 1
  storage_type                    = "gp3"
  enabled_cloudwatch_logs_exports = ["postgresql"]
  skip_final_snapshot             = true
  deletion_protection             = false

  tags = var.tags
}
