terraform {
  backend "s3" {
    bucket       = "uptime-lab-dev-11f3bb"
    key          = "uptime/terraform.tfstate"
    region       = "eu-west-1"
    use_lockfile = true
  }
}