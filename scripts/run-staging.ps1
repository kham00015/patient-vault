# Load .env.staging and start the dev server against AWS RDS.
# Usage: .\scripts\run-staging.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root "staging.env"
if (-not (Test-Path $envFile)) {
  $envFile = Join-Path $root ".env.staging"
}

if (-not (Test-Path $envFile)) {
  Write-Error "staging.env not found. Create it in the project root."
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $name = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim().Trim('"')
  Set-Item -Path "env:$name" -Value $value
}

if ($env:DATABASE_URL -match "YOUR_PASSWORD_HERE") {
  Write-Host ""
  Write-Host "Edit staging.env and replace YOUR_PASSWORD_HERE with the password from AWS Secrets Manager." -ForegroundColor Red
  exit 1
}

Write-Host "Starting Patient Vault (staging -> AWS RDS)..." -ForegroundColor Cyan
Set-Location $root
npm run dev
