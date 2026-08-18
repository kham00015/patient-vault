# Deploy Patient Vault to Lightsail production.
# Usage: .\scripts\deploy-to-lightsail.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$key = Join-Path $env:USERPROFILE ".ssh\LightsailDefaultKey-us-east-1.pem"
$sshHost = "ubuntu@44.196.211.127"
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
  --exclude="data/orders/_zippeek" `
  --exclude="data/orders/_loinc_extract" `
  .
Pop-Location
Write-Host "Created $tar ($([math]::Round((Get-Item $tar).Length / 1MB, 1)) MB)" -ForegroundColor Green

Write-Host "Uploading to server..." -ForegroundColor Cyan
scp -i $key -o StrictHostKeyChecking=no $tar "${sshHost}:/tmp/patient-vault-deploy.tar.gz"
scp -i $key -o StrictHostKeyChecking=no (Join-Path $root ".env.production") "${sshHost}:/tmp/pv-env.production"

$remoteScript = @'
set -euo pipefail
cd /opt/patient-vault
sudo cp .env.production /tmp/pv-env-backup 2>/dev/null || true
sudo cp docker-compose.override.yml /tmp/pv-override-backup.yml 2>/dev/null || true
sudo tar -xzf /tmp/patient-vault-deploy.tar.gz -C /opt/patient-vault

# Merge newly uploaded env with the previously working DATABASE_URL / secrets.
sudo python3 <<'PY'
from pathlib import Path

def load(path):
    d = {}
    p = Path(path)
    if not p.exists():
        return d
    for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        d[k.strip()] = v.strip().strip('"')
    return d

backup = load("/tmp/pv-env-backup")
new = load("/tmp/pv-env.production")
merged = dict(new) if new else dict(backup)
if backup.get("DATABASE_URL"):
    merged["DATABASE_URL"] = backup["DATABASE_URL"]
for k in ("SESSION_SECRET", "ENCRYPTION_KEY", "NEXTAUTH_SECRET"):
    if backup.get(k):
        merged[k] = backup[k]
out = ["# Patient Vault production - deploy merge"]
for k in sorted(merged):
    out.append(f'{k}="{merged[k]}"')
Path("/opt/patient-vault/.env.production").write_text("\n".join(out) + "\n")
print("env keys", len(merged), "kept_backup_db", bool(backup.get("DATABASE_URL")))
PY
sudo chmod 600 /opt/patient-vault/.env.production

# Slim app image has no prisma CLI — keep a clean runtime override.
sudo tee /opt/patient-vault/docker-compose.override.yml >/dev/null <<'EOF'
services:
  app:
    command: ["node", "server.js"]
EOF

cd /opt/patient-vault
echo "=== Building Docker image (5-10 min) ==="
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml build app 2>&1 | tail -25

echo "=== Database schema push ==="
DATABASE_URL=$(sudo grep '^DATABASE_URL=' /opt/patient-vault/.env.production | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//; s/\r$//')
sudo docker run --rm \
  -e "DATABASE_URL=${DATABASE_URL}" \
  -v /opt/patient-vault/prisma:/prisma \
  -w /prisma \
  node:20-alpine \
  sh -c 'npm i prisma@6.19.0 --no-save --ignore-scripts >/dev/null && node node_modules/prisma/build/index.js db push --schema=/prisma/schema.prisma --skip-generate --accept-data-loss'

echo "=== Restarting containers ==="
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --force-recreate 2>&1
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml ps
echo "=== Health check ==="
sleep 12
HEALTH_LOCAL="$(curl -sS --max-time 15 http://localhost/api/health || true)"
echo "$HEALTH_LOCAL"
echo "$HEALTH_LOCAL" | grep -q '"ok":true' || { echo "LOCAL HEALTH CHECK FAILED"; exit 1; }
HEALTH_PUBLIC="$(curl -sS --max-time 20 https://app.patientvault.care/api/health || true)"
echo "$HEALTH_PUBLIC"
echo "$HEALTH_PUBLIC" | grep -q '"ok":true' || { echo "PUBLIC HEALTH CHECK FAILED"; exit 1; }
'@

Write-Host "Deploying on server..." -ForegroundColor Cyan
# PowerShell here-strings use CRLF; bash on Linux treats `\r` as part of paths/commands.
$remoteScriptUnix = ($remoteScript -replace "`r`n", "`n") -replace "`r", "`n"
$remoteScriptUnix | ssh -i $key -o StrictHostKeyChecking=no $sshHost "bash -s"
if ($LASTEXITCODE -ne 0) {
  Write-Error "Deploy finished but health check failed. Do not assume clinic login works."
}

Write-Host ""
Write-Host "Done. Open https://app.patientvault.care" -ForegroundColor Green
Write-Host "Reliability checks: CLINIC_RELIABILITY.md" -ForegroundColor Cyan
