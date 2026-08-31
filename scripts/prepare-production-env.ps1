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
$vars["SESSION_TIMEOUT_MINUTES"] = "5"
$vars["APP_HOSTNAME"] = "app.patientvault.care"
$vars["NEXT_PUBLIC_APP_NAME"] = "AICLIN EMR"
$vars["NEXT_PUBLIC_CLINIC_NAME"] = "Modern Medicine"
$vars["COOKIE_SECURE"] = "true"

if (-not $vars["ACME_EMAIL"]) {
  $vars["ACME_EMAIL"] = "admin@clinic.local"
  Write-Host "Set ACME_EMAIL in .env.production to your real practice email before deploy." -ForegroundColor Yellow
}

if ($vars["DATABASE_URL"] -match '^postgresql://([^:]+):([^@]+)@(.+)$') {
  $dbUser = $Matches[1]
  $dbPass = $Matches[2]
  $dbRest = $Matches[3]
  # Avoid double-encoding if staging.env already has %XX sequences.
  if ($dbPass -notmatch '%[0-9A-Fa-f]{2}') {
    $dbPass = [uri]::EscapeDataString($dbPass)
  }
  $vars["DATABASE_URL"] = "postgresql://${dbUser}:${dbPass}@${dbRest}"
}

# Keep S3 + Bedrock settings when regenerating after setup-s3-production.ps1
if (Test-Path $out) {
  $preserve = @(
    "STORAGE_TYPE",
    "AWS_REGION",
    "AWS_S3_BUCKET",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_KMS_KEY_ID",
    "BEDROCK_MODEL_ID",
    "BEDROCK_REGION",
    "AWS_USE_INSTANCE_ROLE",
    "BEDROCK_DISABLED",
    "ASSEMBLYAI_API_KEY",
    "ASSEMBLYAI_BASE_URL",
    "ASSEMBLYAI_DISABLED"
  )
  Get-Content $out | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    if ($preserve -contains $name) {
      $vars[$name] = $line.Substring($eq + 1).Trim().Trim('"')
    }
  }
}

# Prefer AssemblyAI key from .env.local when preparing a deploy package.
$localEnv = Join-Path $root ".env.local"
if (Test-Path $localEnv) {
  Get-Content $localEnv | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    if ($name -eq "ASSEMBLYAI_API_KEY" -or $name -eq "ASSEMBLYAI_BASE_URL" -or $name -eq "ASSEMBLYAI_DISABLED") {
      $value = $line.Substring($eq + 1).Trim().Trim('"')
      if ($value) { $vars[$name] = $value }
    }
  }
}

if ($vars["STORAGE_TYPE"] -eq "s3") {
  $vars["STORAGE_LOCAL_PATH"] = "/app/storage"
}

if (-not $vars["BEDROCK_MODEL_ID"]) {
  $vars["BEDROCK_MODEL_ID"] = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
}
# Never redeploy a retired Claude 3.5 Sonnet ID (causes "end of its life" in Ask AI).
if ($vars["BEDROCK_MODEL_ID"] -match 'claude-3-5-sonnet|claude-3\.5-sonnet') {
  Write-Host "Replacing retired Bedrock model $($vars['BEDROCK_MODEL_ID']) with Claude Sonnet 4.5" -ForegroundColor Yellow
  $vars["BEDROCK_MODEL_ID"] = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
}
if (-not $vars["AWS_REGION"]) {
  $vars["AWS_REGION"] = "us-east-1"
}

# Never ship password-free visit recorder to production via this script.
# Enable on the server only deliberately when testing with a key.
$vars.Remove("VISIT_RECORDER_TEST_MODE")
$vars.Remove("VISIT_RECORDER_TEST_KEY")
$vars.Remove("VISIT_RECORDER_TEST_USER_EMAIL")

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
