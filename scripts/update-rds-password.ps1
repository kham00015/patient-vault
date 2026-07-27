# Update RDS password in local env files (URL-encoded for Prisma).
# Usage: .\scripts\update-rds-password.ps1
# Get the password from AWS Console > Secrets Manager > rds!db-d2849d7a-...
#
# Why this exists: RDS + Secrets Manager can auto-rotate the master password.
# The app stores DATABASE_URL in .env files, so a rotation silently breaks login
# until you sync the new password here (and to production).

param(
  [string]$Password
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$stagingFile = Join-Path $root "staging.env"
if (-not (Test-Path $stagingFile)) {
  Write-Error "staging.env not found in project root."
}

if (-not $Password) {
  Write-Host ""
  Write-Host "Get the CURRENT RDS password (after any rotation):" -ForegroundColor Cyan
  Write-Host "  AWS Console > Secrets Manager > secret starting with rds!db-d2849d7a"
  Write-Host "  Click Retrieve secret value, then copy the password field"
  Write-Host ""
  Write-Host "Also strongly recommended:" -ForegroundColor Yellow
  Write-Host "  Secrets Manager > that secret > Rotation > Disable automatic rotation"
  Write-Host "  (otherwise AWS can change the password again without updating the app)"
  Write-Host ""
  $secure = Read-Host "Paste RDS password" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

$Password = $Password.Trim()
if ($Password.Length -lt 8) {
  Write-Error "Password looks too short. Paste the full password from Secrets Manager."
}

# Store raw password in staging.env (human-editable); encode for Prisma runtime files.
$hostPart = "patient-vault-db.cj9hnwn91exe.us-east-1.rds.amazonaws.com:5432/patientvault?sslmode=require"
$rawUrl = "postgresql://pvadmin:${Password}@${hostPart}"
$encodedPass = [uri]::EscapeDataString($Password)
$encodedUrl = "postgresql://pvadmin:${encodedPass}@${hostPart}"

function Set-DatabaseUrl([string]$file, [string]$url) {
  if (-not (Test-Path $file)) {
    Set-Content -Path $file -Value "DATABASE_URL=`"$url`"" -Encoding UTF8
    return
  }
  $content = Get-Content $file -Raw
  if ($content -match 'DATABASE_URL="[^"]*"') {
    $content = $content -replace 'DATABASE_URL="[^"]*"', "DATABASE_URL=`"$url`""
  } elseif ($content -match "DATABASE_URL='[^']*'") {
    $content = $content -replace "DATABASE_URL='[^']*'", "DATABASE_URL=`"$url`""
  } elseif ($content -match '(?m)^DATABASE_URL=.*$') {
    $content = $content -replace '(?m)^DATABASE_URL=.*$', "DATABASE_URL=`"$url`""
  } else {
    $content = "DATABASE_URL=`"$url`"`n" + $content
  }
  Set-Content -Path $file -Value $content.TrimEnd() -Encoding UTF8
}

Set-DatabaseUrl $stagingFile $rawUrl
Write-Host "Updated staging.env" -ForegroundColor Green

foreach ($name in @(".env.local", ".env.production")) {
  $path = Join-Path $root $name
  Set-DatabaseUrl $path $encodedUrl
  Write-Host "Updated $name (URL-encoded)" -ForegroundColor Green
}

& (Join-Path $PSScriptRoot "run-staging.ps1") -TestOnly
if ($LASTEXITCODE -ne 0) {
  Write-Host "Connection test failed. Double-check the password from Secrets Manager." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Password saved locally and DB connection works." -ForegroundColor Green
Write-Host "Push to production (no full rebuild):" -ForegroundColor Cyan
Write-Host "  .\scripts\sync-db-password-to-production.ps1"
