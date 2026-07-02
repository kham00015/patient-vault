# Download fixed Dockerfile from GitHub and rebuild on Lightsail.
$desktop = [Environment]::GetFolderPath("Desktop")
$outFile = Join-Path $desktop "PASTE-FIX-DOCKER.txt"

$script = @'
cd /opt/patient-vault
curl -fsSL https://raw.githubusercontent.com/kham00015/patient-vault/master/Dockerfile -o Dockerfile
echo "=== Must show COPY prisma and ignore-scripts below ==="
grep -A4 "FROM base AS deps" Dockerfile
git pull origin master
echo "=== Rebuilding (5-8 min) ==="
docker compose -f docker-compose.production.yml build --no-cache 2>&1 | tee ~/deploy.log
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps
curl -s http://localhost/api/health
echo ""
'@

Set-Content -Path $outFile -Value $script -Encoding UTF8
Write-Host "Wrote: $outFile" -ForegroundColor Green
