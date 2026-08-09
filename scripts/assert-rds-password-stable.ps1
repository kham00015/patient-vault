# Assert RDS is NOT using Secrets Manager-managed master password.
# Managed/rotated master passwords silently break Patient Vault login.
# Usage: .\scripts\assert-rds-password-stable.ps1

$ErrorActionPreference = "Stop"
$region = "us-east-1"
$id = "patient-vault-db"

$json = aws rds describe-db-instances `
  --db-instance-identifier $id `
  --region $region `
  --output json | ConvertFrom-Json

$inst = $json.DBInstances[0]
if (-not $inst) {
  Write-Error "RDS instance $id not found"
}

$managed = $inst.MasterUserSecret
$status = $inst.DBInstanceStatus

Write-Host "RDS $id status: $status" -ForegroundColor Cyan

if ($managed -and $managed.SecretArn) {
  Write-Host "FAIL: Master password is managed by Secrets Manager." -ForegroundColor Red
  Write-Host "  Secret: $($managed.SecretArn)" -ForegroundColor Yellow
  Write-Host "  AWS can rotate it without updating the app - that is what broke clinic login." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Fix (keeps a known password in .env.production):" -ForegroundColor Cyan
  Write-Host "  1. Generate/set a password you control"
  Write-Host "  2. aws rds modify-db-instance --db-instance-identifier patient-vault-db --no-manage-master-user-password --master-user-password <pw> --apply-immediately --region us-east-1"
  Write-Host "  3. .\scripts\fix-live-login.ps1  (with that password)"
  exit 1
}

Write-Host "OK: Master password is NOT Secrets Manager-managed." -ForegroundColor Green
Write-Host "Rotation cannot silently break clinic login." -ForegroundColor Green
exit 0
