# Configure AWS CLI for the aloha account (885362002526) where patient-vault-db lives.
# Run in PowerShell: .\scripts\configure-aws-aloha.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AWS CLI — aloha account setup" -ForegroundColor Cyan
Write-Host "Create keys first: IAM -> Users -> your user -> Security credentials -> Create access key -> CLI"
Write-Host "Account should be 885362002526 (patient-vault-db in us-east-1)."
Write-Host ""

$accessKey = Read-Host "Access Key ID"
$secret = Read-Host "Secret Access Key" -AsSecureString
$secretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
)

aws configure set aws_access_key_id $accessKey --profile aloha
aws configure set aws_secret_access_key $secretPlain --profile aloha
aws configure set region us-east-1 --profile aloha
aws configure set output json --profile aloha

# Also set as default profile for this machine
aws configure set aws_access_key_id $accessKey
aws configure set aws_secret_access_key $secretPlain
aws configure set region us-east-1
aws configure set output json

Write-Host ""
Write-Host "Verifying..." -ForegroundColor Yellow
aws sts get-caller-identity
aws rds describe-db-instances --db-instance-identifier patient-vault-db --query "DBInstances[0].{Endpoint:Endpoint.Address,Engine:Engine,Status:DBInstanceStatus}" --output table

Write-Host ""
Write-Host "Done. Default CLI now points at the aloha account." -ForegroundColor Green
