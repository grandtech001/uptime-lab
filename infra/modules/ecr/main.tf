module "ecr" {
  source   = "terraform-aws-modules/ecr/aws"
  version  = "3.2.0"
  for_each = toset(["gateway", "checker-api", "scheduler"])

  repository_name = "${var.repository_name}/${each.key}"

  create_lifecycle_policy = false

  tags = var.tags
}
