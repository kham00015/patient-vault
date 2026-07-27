# Deploy Patient Vault to Lightsail production.
# Usage: .\scripts\deploy-to-lightsail.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$key = Join-Path $env:USERPROFILE ".ssh\LightsailDefaultKey-us-east-1.pem"
$sshHost = "ubuntu@44.196.211.127"
$remote = "/opt/patient-vault"
$tar = Join-Path $env:TEMP "patient-vault-deploy.tar.gz"

if (-not (Test-Path $key)) { Write-Error "SSH key not found: $key" }

Write-Host "Preparing production env..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "prepare-production-env.ps1")

Write-Host "Packaging source..." -ForegroundColor Cyan
if (Test-Path $tar) { Remove-Item $tar -Force }
Push-Location $root
tar -czf $tar `
  --exclude=node_modules `
  --exclude=.next `
  --exclude=.git `
  --exclude=storage `
  --exclude="*.tar.gz" `
  .
Pop-Location
Write-Host "Created $tar ($([math]::Round((Get-Item $tar).Length / 1MB, 1)) MB)" -ForegroundColor Green

Write-Host "Uploading to server..." -ForegroundColor Cyan
scp -i $key -o StrictHostKeyChecking=no $tar "${sshHost}:/tmp/patient-vault-deploy.tar.gz"
scp -i $key -o StrictHostKeyChecking=no (Join-Path $root ".env.production") "${sshHost}:/tmp/pv-env.production"

$remoteScript = @'
set -e
cd /opt/patient-vault
sudo cp .env.production /tmp/pv-env-backup 2>/dev/null || true
sudo cp docker-compose.override.yml /tmp/pv-override-backup.yml 2>/dev/null || true
sudo tar -xzf /tmp/patient-vault-deploy.tar.gz -C /opt/patient-vault
sudo cp /tmp/pv-env.production /opt/patient-vault/.env.production
sudo chmod 600 /opt/patient-vault/.env.production
if [ -f /tmp/pv-override-backup.yml ]; then
  sudo cp /tmp/pv-override-backup.yml /opt/patient-vault/docker-compose.override.yml
fi
cd /opt/patient-vault
echo "=== Building Docker image (5-10 min) ==="
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml build app 2>&1 | tail -20
echo "=== Database schema push ==="
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml run --rm --no-deps --entrypoint sh app -c "node ./node_modules/prisma/build/index.js db push --skip-generate" 2>&1 | tail -10
echo "=== Restarting containers ==="
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --force-recreate 2>&1
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml ps
echo "=== Health check ==="
sleep 5
curl -s http://localhost/api/health
echo ""
'@

Write-Host "Deploying on server..." -ForegroundColor Cyan
# PowerShell here-strings use CRLF; bash on Linux treats `\r` as part of paths/commands.
$remoteScriptUnix = ($remoteScript -replace "`r`n", "`n") -replace "`r", "`n"
$remoteScriptUnix | ssh -i $key -o StrictHostKeyChecking=no $sshHost "bash -s"

Write-Host ""
Write-Host "Done. Open http://app.patientvault.care" -ForegroundColor Green
