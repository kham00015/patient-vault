# Push .env.production only and restart app (no full rebuild). Use after RDS password fix.
# Usage: .\scripts\restart-production-env.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$key = Join-Path $env:USERPROFILE ".ssh\LightsailDefaultKey-us-east-1.pem"
$sshHost = "ubuntu@44.196.211.127"

if (-not (Test-Path $key)) { Write-Error "SSH key not found: $key" }
if (-not (Test-Path (Join-Path $root ".env.production"))) {
  & (Join-Path $PSScriptRoot "prepare-production-env.ps1")
}

Write-Host "Uploading .env.production..." -ForegroundColor Cyan
scp -i $key -o StrictHostKeyChecking=no (Join-Path $root ".env.production") "${sshHost}:/tmp/pv-env.production"

$remoteScript = @'
set -e
sudo cp /tmp/pv-env.production /opt/patient-vault/.env.production
sudo chmod 600 /opt/patient-vault/.env.production
cd /opt/patient-vault
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --force-recreate app caddy
sleep 5
curl -s http://localhost/api/health
echo ""
'@

$remoteScriptUnix = ($remoteScript -replace "`r`n", "`n") -replace "`r", "`n"
Write-Host "Restarting production containers..." -ForegroundColor Cyan
$remoteScriptUnix | ssh -i $key -o StrictHostKeyChecking=no $sshHost "bash -s"

Write-Host ""
Write-Host "Check: https://app.patientvault.care/api/health" -ForegroundColor Green
