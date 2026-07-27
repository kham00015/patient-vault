# Fix production login when RDS password is correct but app config is stale.
# Usage:
#   .\scripts\fix-live-login.ps1
#   (paste password when prompted - from AWS Secrets Manager > rds!db-d2849d7a...)
#
# Or without prompt:
#   $env:PV_RDS_PASSWORD = 'paste-here'
#   .\scripts\fix-live-login.ps1

param(
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$password = $env:PV_RDS_PASSWORD
if (-not $password) {
  & (Join-Path $PSScriptRoot "update-rds-password.ps1")
  if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
  & (Join-Path $PSScriptRoot "update-rds-password.ps1") -Password $password
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

& (Join-Path $PSScriptRoot "prepare-production-env.ps1")

if ($SkipDeploy) {
  Write-Host "SkipDeploy set - .env.production updated locally only." -ForegroundColor Yellow
  Write-Host "Push credentials only with: .\scripts\sync-db-password-to-production.ps1" -ForegroundColor Cyan
  exit 0
}

# Prefer fast credential sync over full image rebuild.
& (Join-Path $PSScriptRoot "sync-db-password-to-production.ps1")

Write-Host ""
Write-Host "When that finishes, open:" -ForegroundColor Green
Write-Host "  https://app.patientvault.care/api/health" -ForegroundColor Cyan
Write-Host '  (should show ok:true)' -ForegroundColor Gray
Write-Host "Disable Secrets Manager auto-rotation so this does not recur." -ForegroundColor Yellow
