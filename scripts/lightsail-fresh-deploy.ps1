# Fresh clone from GitHub — fixes server when git pull fails.
$desktop = [Environment]::GetFolderPath("Desktop")
$outFile = Join-Path $desktop "PASTE-FRESH-DEPLOY.txt"

$script = @'
set -e
cp /opt/patient-vault/.env.production /tmp/pv-env-backup 2>/dev/null || true
cd /opt
rm -rf patient-vault-old
mv patient-vault patient-vault-old 2>/dev/null || true
git clone https://github.com/kham00015/patient-vault.git patient-vault
cp /tmp/pv-env-backup /opt/patient-vault/.env.production
chmod 600 /opt/patient-vault/.env.production
cd /opt/patient-vault
echo "=== Must show slice(0, 10) NOT toISOString ==="
grep "decrypted.date" src/app/api/patients/[id]/ai/organize/route.ts
echo "=== Rebuilding (5-10 min) ==="
docker compose -f docker-compose.production.yml build --no-cache 2>&1 | tee ~/deploy.log
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps
curl -s http://localhost/api/health
echo ""
'@

Set-Content -Path $outFile -Value $script -Encoding UTF8
Write-Host "Wrote: $outFile" -ForegroundColor Green
