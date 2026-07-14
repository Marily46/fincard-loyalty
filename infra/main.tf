terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ---------------------------------------------------------------------------
# ECR: repositorio para la imagen del contenedor
# ---------------------------------------------------------------------------
resource "aws_ecr_repository" "app" {
  name                 = "fincard-loyalty"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# ---------------------------------------------------------------------------
# IAM: rol que App Runner usa para leer la imagen desde ECR
# ---------------------------------------------------------------------------
resource "aws_iam_role" "apprunner_ecr_access" {
  name = "fincard-apprunner-ecr-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "build.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  role       = aws_iam_role.apprunner_ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# ---------------------------------------------------------------------------
# App Runner: el servicio que expone el API con HTTPS administrado
# ---------------------------------------------------------------------------
resource "aws_apprunner_service" "app" {
  service_name = "fincard-loyalty"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    image_repository {
      image_identifier      = "${aws_ecr_repository.app.repository_url}:latest"
      image_repository_type = "ECR"

      image_configuration {
        port = "3000"
        runtime_environment_variables = {
          NODE_ENV = "production"
        }
      }
    }

    auto_deployments_enabled = true
  }

  instance_configuration {
    cpu    = "256"  # 0.25 vCPU (mínimo, suficiente para la demo)
    memory = "512"  # 0.5 GB
  }

  health_check_configuration {
    protocol = "HTTP"
    path     = "/health"
    interval = 10
    timeout  = 5
  }
}

output "service_url" {
  description = "URL pública HTTPS del API"
  value       = "https://${aws_apprunner_service.app.service_url}"
}

output "ecr_repository_url" {
  description = "URL del repositorio ECR para docker push"
  value       = aws_ecr_repository.app.repository_url
}
