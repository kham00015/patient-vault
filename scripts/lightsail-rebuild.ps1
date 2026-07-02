# Download fixed messages route from GitHub and rebuild on Lightsail.
$desktop = [Environment]::GetFolderPath("Desktop")
$outFile = Join-Path $desktop "PASTE-REBUILD.txt"

$script = @'
cd /opt/patient-vault
curl -fsSL https://raw.githubusercontent.com/kham00015/patient-vault/master/src/app/api/messages/route.ts -o src/app/api/messages/route.ts
echo "=== Must show MessagePriority.ROUTINE below ==="
grep "priority:" src/app/api/messages/route.ts
echo "=== Rebuilding (5-8 min) ==="
docker compose -f docker-compose.production.yml build --no-cache 2>&1 | tee ~/deploy.log
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps
curl -s http://localhost/api/health
echo ""
'@

Set-Content -Path $outFile -Value $script -Encoding UTF8
Write-Host "Wrote: $outFile" -ForegroundColor Green
