# Builds ONE block to paste into Lightsail browser SSH (no nano, no file upload).
# Usage: .\scripts\lightsail-one-paste.ps1
# Output: Desktop\PASTE-IN-LIGHTSAIL.txt

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root ".env.production"
$desktop = [Environment]::GetFolderPath("Desktop")
$outFile = Join-Path $desktop "PASTE-IN-LIGHTSAIL.txt"

if (-not (Test-Path $envFile)) {
  & (Join-Path $PSScriptRoot "prepare-production-env.ps1")
}

$raw = [System.IO.File]::ReadAllText($envFile)
$raw = $raw.TrimStart([char]0xFEFF)
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($raw))

$script = @"
cd /opt/patient-vault
echo '$b64' | base64 -d > .env.production
chmod 600 .env.production
echo "Starting Docker (3-5 minutes)..."
docker compose -f docker-compose.production.yml up -d --build 2>&1 | tee ~/deploy.log
echo ""
docker compose -f docker-compose.production.yml ps
echo ""
curl -s http://localhost/api/health || true
echo ""
echo "If you see ok above, the app is running. Open https://app.patientvault.care after DNS is set."
"@

Set-Content -Path $outFile -Value $script -Encoding UTF8 -NoNewline
Add-Content -Path $outFile -Value "`n"

Write-Host "Wrote: $outFile" -ForegroundColor Green
Write-Host "1. AWS Lightsail -> patient-vault-prod -> Connect (browser SSH)" -ForegroundColor Cyan
Write-Host "2. Open PASTE-IN-LIGHTSAIL.txt on Desktop, Ctrl+A, Ctrl+C" -ForegroundColor Cyan
Write-Host "3. Click in the black SSH window, right-click to paste, press Enter" -ForegroundColor Cyan
