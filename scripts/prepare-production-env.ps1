# Build .env.production from staging.env for Lightsail deploy.
# Usage: .\scripts\prepare-production-env.ps1
# Output: .env.production (gitignored) — upload to server only.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$staging = Join-Path $root "staging.env"
$out = Join-Path $root ".env.production"

if (-not (Test-Path $staging)) {
  Write-Error "staging.env not found. Create it first."
}

$vars = @{}
Get-Content $staging | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $name = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim().Trim('"')
  $vars[$name] = $value
}

$vars["NODE_ENV"] = "production"
$vars["APP_ENV"] = "production"
$vars["SESSION_TIMEOUT_MINUTES"] = "15"
$vars["APP_HOSTNAME"] = "app.patientvault.care"
$vars["NEXT_PUBLIC_APP_NAME"] = "Patient Vault"
$vars["NEXT_PUBLIC_CLINIC_NAME"] = "Modern Medicine"

if (-not $vars["ACME_EMAIL"]) {
  $vars["ACME_EMAIL"] = "admin@clinic.local"
  Write-Host "Set ACME_EMAIL in .env.production to your real practice email before deploy." -ForegroundColor Yellow
}

if ($vars["DATABASE_URL"] -match '^postgresql://([^:]+):([^@]+)@(.+)$') {
  $dbUser = $Matches[1]
  $dbPass = $Matches[2]
  $dbRest = $Matches[3]
  $vars["DATABASE_URL"] = "postgresql://${dbUser}:$([uri]::EscapeDataString($dbPass))@${dbRest}"
}

$lines = @(
  "# Patient Vault production - generated $(Get-Date -Format 'yyyy-MM-dd')",
  "# Upload to Lightsail: /opt/patient-vault/.env.production",
  ""
)
foreach ($key in ($vars.Keys | Sort-Object)) {
  $lines += "$key=`"$($vars[$key])`""
}

Set-Content -Path $out -Value ($lines -join "`n") -Encoding UTF8
Write-Host "Wrote $out" -ForegroundColor Green
Write-Host "Upload this file to the server. Do NOT commit to git." -ForegroundColor Cyan
