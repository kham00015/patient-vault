# Fix production DATABASE_URL encoding + rebuild app on Lightsail.
# Usage: .\scripts\fix-prod-database-url.ps1
# Then paste Desktop\FIX-LOGIN-PASTE.txt into Lightsail browser SSH.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$secretId = "rds!db-d2849d7a-4b6b-4cd0-a5b2-064f2b113569"
$region = "us-east-1"
$hostName = "patient-vault-db.cj9hnwn91exe.us-east-1.rds.amazonaws.com"

$secJson = aws secretsmanager get-secret-value --secret-id $secretId --region $region --query SecretString --output text
$sec = $secJson | ConvertFrom-Json
$user = $sec.username
$passEnc = [uri]::EscapeDataString($sec.password)
$dbUrl = "postgresql://${user}:${passEnc}@${hostName}:5432/patientvault?sslmode=require"

# Keep other keys from local production file when present
$localProd = Join-Path $root ".env.production.local"
$jwt = ""
$enc = ""
if (Test-Path $localProd) {
  Get-Content $localProd | ForEach-Object {
    if ($_ -match '^JWT_SECRET="?(.*?)"?\s*$') { $jwt = $Matches[1] }
    if ($_ -match '^ENCRYPTION_KEY="?(.*?)"?\s*$') { $enc = $Matches[1] }
  }
}

if (-not $jwt -or -not $enc) {
  throw "Missing JWT_SECRET/ENCRYPTION_KEY in .env.production.local"
}

# Minimal env replacement script: only rewrite DATABASE_URL on server, recreate app
# Use python on server so we don't clobber other settings.
$py = @"
from pathlib import Path
import re
p = Path('/opt/patient-vault/.env.production')
text = p.read_text()
new = '''DATABASE_URL="$dbUrl"'''
if re.search(r'^DATABASE_URL=.*$', text, flags=re.M):
    text = re.sub(r'^DATABASE_URL=.*$', new, text, flags=re.M)
else:
    text = new + '\n' + text
p.write_text(text)
print('DATABASE_URL updated')
"@

$pyB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($py))

$script = @"
cd /opt/patient-vault
echo '$pyB64' | base64 -d > /tmp/fix-dburl.py
sudo python3 /tmp/fix-dburl.py
sudo grep -E '^DATABASE_URL=' .env.production | sed -E 's/:[^@\/]+@/:***@/'
echo "Recreating app container..."
sudo docker compose -f docker-compose.production.yml up -d --force-recreate app
echo "Waiting for health..."
sleep 8
curl -sS http://127.0.0.1/api/health || curl -sS http://127.0.0.1:3000/api/health || true
echo ""
sudo docker compose -f docker-compose.production.yml ps
"@

$desktop = [Environment]::GetFolderPath("Desktop")
$outFile = Join-Path $desktop "FIX-LOGIN-PASTE.txt"
Set-Content -Path $outFile -Value $script -Encoding utf8

# Also update local production.local
$local = Get-Content $localProd -Raw
$local = $local -replace '(?m)^DATABASE_URL=.*$', "DATABASE_URL=`"$dbUrl`""
[System.IO.File]::WriteAllText($localProd, $local)

Write-Host "Wrote $outFile" -ForegroundColor Green
Write-Host "1. Lightsail -> patient-vault-prod -> Connect" -ForegroundColor Cyan
Write-Host "2. Paste FIX-LOGIN-PASTE.txt into the SSH window, press Enter" -ForegroundColor Cyan
Write-Host "3. Health should show {`"ok`":true}" -ForegroundColor Cyan
