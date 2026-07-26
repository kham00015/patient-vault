# Pull all build fixes from GitHub and rebuild on Lightsail.
$desktop = [Environment]::GetFolderPath("Desktop")
$outFile = Join-Path $desktop "PASTE-REBUILD.txt"

$script = @'
cd /opt/patient-vault
git fetch origin master
git reset --hard origin/master
echo "=== Code version check ==="
grep "slice(0, 10)" src/app/api/patients/[id]/ai/organize/route.ts
echo "=== Rebuilding (5-10 min) ==="
docker compose -f docker-compose.production.yml build --no-cache 2>&1 | tee ~/deploy.log
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps
curl -s http://localhost/api/health
echo ""
'@

Set-Content -Path $outFile -Value $script -Encoding UTF8
Write-Host "Wrote: $outFile" -ForegroundColor Green
