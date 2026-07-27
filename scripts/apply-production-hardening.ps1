# Deploy hardening (rate limits, headers) and optional S3 config to production.
# Usage: .\scripts\apply-production-hardening.ps1
#        .\scripts\apply-production-hardening.ps1 -SkipBuild   # env-only update

param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$key = Join-Path $env:USERPROFILE ".ssh\LightsailDefaultKey-us-east-1.pem"
$sshHost = "ubuntu@44.196.211.127"
$tar = Join-Path $env:TEMP "patient-vault-hardening.tar.gz"

Write-Host "=== Backup verification ===" -ForegroundColor Cyan
# ASCII-only scripts for Windows PowerShell compatibility
& (Join-Path $PSScriptRoot "verify-backups.ps1")
Write-Host ""

if (-not $SkipBuild) {
  Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep 2
  Write-Host "=== Building app ===" -ForegroundColor Cyan
  Set-Location $root
  npm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& (Join-Path $PSScriptRoot "prepare-production-env.ps1")

Write-Host "=== Packaging ===" -ForegroundColor Cyan
if (Test-Path $tar) { Remove-Item $tar -Force }
Push-Location $root
tar -czf $tar --exclude=node_modules --exclude=.next --exclude=.git --exclude=storage .
Pop-Location

Write-Host "=== Uploading ===" -ForegroundColor Cyan
scp -i $key -o StrictHostKeyChecking=no $tar "${sshHost}:/tmp/pv-hardening.tar.gz"
scp -i $key -o StrictHostKeyChecking=no (Join-Path $root ".env.production") "${sshHost}:/tmp/pv-env.production"

$remoteScript = Join-Path $env:TEMP "pv-hardening-remote.sh"
$bash = @'
#!/bin/bash
set -e
cd /opt/patient-vault
sudo cp .env.production /tmp/pv-env-backup-$(date +%s) 2>/dev/null || true
sudo tar -xzf /tmp/pv-hardening.tar.gz -C /opt/patient-vault
sudo cp /tmp/pv-env.production /opt/patient-vault/.env.production
sudo chmod 600 /opt/patient-vault/.env.production
sudo sed -i 's/\r$//' /opt/patient-vault/docker-entrypoint.sh
STORAGE_TYPE=$(grep '^STORAGE_TYPE=' /opt/patient-vault/.env.production | cut -d= -f2 | tr -d '"')
if [ "$STORAGE_TYPE" = "s3" ]; then
  echo "=== Building with S3 support ==="
  sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml build app 2>&1 | tail -12
else
  echo "=== Quick rebuild (local storage) ==="
  sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml build app 2>&1 | tail -8
fi
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --force-recreate app
sleep 12
curl -s http://localhost/api/health
echo ""
if [ "$STORAGE_TYPE" = "s3" ]; then
  echo "=== Migrating local docs to S3 ==="
  sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml exec -T app node scripts/migrate-local-docs-to-s3.js 2>&1 | tail -15
fi
'@
[System.IO.File]::WriteAllText($remoteScript, $bash.Replace("`r`n", "`n"))

Write-Host "=== Deploying on server ===" -ForegroundColor Cyan
scp -i $key -o StrictHostKeyChecking=no $remoteScript "${sshHost}:/tmp/pv-hardening.sh"
ssh -i $key -o StrictHostKeyChecking=no $sshHost "chmod +x /tmp/pv-hardening.sh && sudo bash /tmp/pv-hardening.sh"

Write-Host ""
Write-Host "=== Live check ===" -ForegroundColor Cyan
curl.exe -s https://app.patientvault.care/api/health
Write-Host ""
Write-Host "Done." -ForegroundColor Green
