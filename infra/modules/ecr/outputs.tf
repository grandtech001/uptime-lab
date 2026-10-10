output "repository_url" {
  value = { for k, v in module.ecr : k => v.repository_url }
}

output "repository_name" {
  value = { for k, v in module.ecr : k => v.repository_name }
}

output "repository_arn" {
  value = { for k, v in module.ecr : k => v.repository_arn }
}