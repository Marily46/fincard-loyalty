# Infraestructura (Terraform)

Despliegue del API en **AWS App Runner** con imagen en **ECR**. App Runner administra HTTPS, escalado y health checks contra `/health`.

## Requisitos

- Terraform >= 1.5
- AWS CLI autenticado (`aws configure`) con permisos sobre ECR, App Runner e IAM
- Docker

## Despliegue

```bash
cd infra
terraform init
terraform apply -target=aws_ecr_repository.app   # 1. crear solo el ECR

# 2. construir y subir la imagen
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com
docker build -t fincard-loyalty ..
docker tag fincard-loyalty:latest $AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com/fincard-loyalty:latest
docker push $AWS_ACCOUNT.dkr.ecr.$REGION.amazonaws.com/fincard-loyalty:latest

# 3. crear el resto (IAM + App Runner)
terraform apply
```

El output `service_url` es la URL pública del API.

## Costo estimado

Instancia mínima (0.25 vCPU / 0.5 GB): ~5 USD/mes. `terraform destroy` elimina todo al terminar la evaluación.

## Nota sobre persistencia

El contenedor usa disco efímero para la emulación local de S3/BD (suficiente para la demo). El diseño de producción con S3/Glue/RDS reales está documentado en `../docs/DESIGN.md`.
