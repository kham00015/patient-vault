# Install (or refresh) the production health watchdog cron on Lightsail.
# Checks https://app.patientvault.care/api/health every minute.
#
# Optional: set HEALTHCHECK_PING_URL to a Healthchecks.io / Better Stack ping URL
# so you get email/SMS when the clinic site goes down.
#
# Usage:
#   .\scripts\install-production-health-watchdog.ps1
#   $env:HEALTHCHECK_PING_URL = 'https://hc-ping.com/your-uuid'
#   .\scripts\install-production-health-watchdog.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$key = Join-Path $env:USERPROFILE ".ssh\LightsailDefaultKey-us-east-1.pem"
$sshHost = "ubuntu@44.196.211.127"
$localWatch = Join-Path $PSScriptRoot "production-health-watchdog.sh"
$pingUrl = $env:HEALTHCHECK_PING_URL

if (-not (Test-Path $key)) { Write-Error "SSH key not found: $key" }
if (-not (Test-Path $localWatch)) { Write-Error "Missing $localWatch" }

Write-Host "Installing production health watchdog..." -ForegroundColor Cyan
scp -i $key -o StrictHostKeyChecking=no $localWatch "${sshHost}:/tmp/production-health-watchdog.sh"

$pingLine = if ($pingUrl) { "HEALTHCHECK_PING_URL='$pingUrl'" } else { "HEALTHCHECK_PING_URL=''" }

$remote = @"
set -euo pipefail
sudo mkdir -p /opt/patient-vault/scripts /var/lib/patient-vault
sudo mv /tmp/production-health-watchdog.sh /opt/patient-vault/scripts/production-health-watchdog.sh
sudo sed -i 's/\r$//' /opt/patient-vault/scripts/production-health-watchdog.sh
sudo chmod 755 /opt/patient-vault/scripts/production-health-watchdog.sh

# Env for cron
sudo tee /etc/default/patient-vault-health >/dev/null <<EOF
PV_HEALTH_URL='https://app.patientvault.care/api/health'
PV_HEALTH_LOG='/var/log/patient-vault-health.log'
PV_HEALTH_STATE='/var/lib/patient-vault/health-state'
$pingLine
EOF

# Cron every minute
CRON_LINE='* * * * * . /etc/default/patient-vault-health; /opt/patient-vault/scripts/production-health-watchdog.sh >/dev/null 2>&1'
(sudo crontab -l 2>/dev/null | grep -v production-health-watchdog || true; echo "`$CRON_LINE") | sudo crontab -
echo 'Installed crontab:'
sudo crontab -l | grep production-health-watchdog || true

# Run once now
sudo bash -c '. /etc/default/patient-vault-health; /opt/patient-vault/scripts/production-health-watchdog.sh' && echo 'Watchdog check: OK' || echo 'Watchdog check: FAIL (see /var/log/patient-vault-health.log)'
tail -n 5 /var/log/patient-vault-health.log 2>/dev/null || true
"@

$remoteUnix = ($remote -replace "`r`n", "`n") -replace "`r", "`n"
$remoteUnix | ssh -i $key -o StrictHostKeyChecking=no $sshHost "bash -s"

Write-Host ""
Write-Host "Watchdog installed (every 1 min)." -ForegroundColor Green
if ($pingUrl) {
  Write-Host "External ping alerts enabled via HEALTHCHECK_PING_URL." -ForegroundColor Green
} else {
  Write-Host "No external ping URL set yet. For phone/email alerts:" -ForegroundColor Yellow
  Write-Host "  1. Create a free check at https://healthchecks.io (or UptimeRobot)" -ForegroundColor Yellow
  Write-Host "  2. `$env:HEALTHCHECK_PING_URL = 'https://hc-ping.com/<uuid>'" -ForegroundColor Yellow
  Write-Host "  3. Re-run this script" -ForegroundColor Yellow
}
Write-Host "Also run periodically: .\scripts\assert-rds-password-stable.ps1" -ForegroundColor Cyan
