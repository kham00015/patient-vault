# Deploy login cookie fix to Lightsail via SSH (run on your PC).
$key = "$env:USERPROFILE\.ssh\lightsail.pem"
if (-not (Test-Path $key)) {
  Write-Host "Missing $key" -ForegroundColor Red
  Write-Host "Download Lightsail SSH key: Account -> SSH keys -> Default (Virginia)" -ForegroundColor Yellow
  Write-Host "Save as: $key" -ForegroundColor Yellow
  exit 1
}

$cmd = @'
curl -fsSL https://raw.githubusercontent.com/kham00015/patient-vault/master/src/lib/auth.ts -o /opt/patient-vault/src/lib/auth.ts
curl -fsSL https://raw.githubusercontent.com/kham00015/patient-vault/master/src/app/api/auth/login/route.ts -o /opt/patient-vault/src/app/api/auth/login/route.ts
curl -fsSL https://raw.githubusercontent.com/kham00015/patient-vault/master/src/middleware.ts -o /opt/patient-vault/src/middleware.ts
cd /opt/patient-vault
docker compose -f docker-compose.production.yml -f docker-compose.override.yml build --no-cache
docker compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --force-recreate
curl -s http://localhost/api/health
'@

Write-Host "Connecting to Lightsail (build takes 5-10 min)..." -ForegroundColor Cyan
ssh -i $key -o StrictHostKeyChecking=no ubuntu@44.196.211.127 $cmd
