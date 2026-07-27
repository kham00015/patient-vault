# Sync local .env.production DATABASE_URL to Lightsail and restart app (no Docker rebuild).
# Usage (after update-rds-password.ps1 succeeds):
#   .\scripts\sync-db-password-to-production.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$key = Join-Path $env:USERPROFILE ".ssh\LightsailDefaultKey-us-east-1.pem"
$sshHost = "ubuntu@44.196.211.127"
$envFile = Join-Path $root ".env.production"

if (-not (Test-Path $key)) { Write-Error "SSH key not found: $key" }
if (-not (Test-Path $envFile)) { Write-Error ".env.production missing. Run .\scripts\update-rds-password.ps1 first." }

Write-Host "Uploading .env.production..." -ForegroundColor Cyan
scp -i $key -o StrictHostKeyChecking=no $envFile "${sshHost}:/tmp/pv-env.production"

$remote = @'
set -e
sudo cp /tmp/pv-env.production /opt/patient-vault/.env.production
sudo chmod 600 /opt/patient-vault/.env.production
cd /opt/patient-vault
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --force-recreate app
sleep 8
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml ps
curl -sS --max-time 15 http://localhost/api/health || true
echo
'@
$remoteUnix = ($remote -replace "`r`n", "`n") -replace "`r", "`n"
Write-Host "Restarting production app..." -ForegroundColor Cyan
$remoteUnix | ssh -i $key -o StrictHostKeyChecking=no $sshHost "bash -s"

Write-Host ""
Write-Host "Done. Try login at https://app.patientvault.care" -ForegroundColor Green
Write-Host "To prevent this recurring: Secrets Manager > rds!db-... > disable automatic rotation." -ForegroundColor Yellow
