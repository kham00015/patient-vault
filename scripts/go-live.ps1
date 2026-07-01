# One-click demo: starts Patient Vault on the web with a shareable link.
# Double-click this file or run: .\scripts\go-live.ps1
# Your data saves to AWS (staging database). Keep this window open during the demo.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Load-StagingEnv {
  $envFile = Join-Path $root "staging.env"
  if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host "staging.env not found. Ask your tech contact to set up AWS staging first." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
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
  $env:NODE_ENV = "production"
}

function Ensure-Cloudflared {
  $dir = Join-Path $env:LOCALAPPDATA "patient-vault"
  $exe = Join-Path $dir "cloudflared.exe"
  if (Test-Path $exe) { return $exe }

  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  Write-Host "Downloading tunnel tool (one-time)..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing
  return $exe
}

Load-StagingEnv

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Modern Medicine — Patient Vault Demo" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

if (-not (Test-Path (Join-Path $root ".next"))) {
  Write-Host "First-time setup: building app (2-3 minutes)..." -ForegroundColor Yellow
  npm run build
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed. Send a screenshot of this window to your tech contact." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
  }
}

$cloudflared = Ensure-Cloudflared

# Start app in background job
$appJob = Start-Job -ScriptBlock {
  param($projectRoot)
  Set-Location $projectRoot
  Get-Content (Join-Path $projectRoot "staging.env") | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim().Trim('"')
    Set-Item -Path "env:$name" -Value $value
  }
  $env:NODE_ENV = "production"
  npm start 2>&1
} -ArgumentList $root

Write-Host "Starting app..." -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
}
if (-not $ready) {
  Write-Host "App did not start in time. Check the window for errors." -ForegroundColor Red
  Receive-Job $appJob
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host "Opening public link..." -ForegroundColor Cyan
$tunnelLog = Join-Path $env:TEMP "patient-vault-tunnel.log"
if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force }

$tunnelProc = Start-Process -FilePath $cloudflared -ArgumentList @("tunnel", "--url", "http://localhost:3000", "--logfile", $tunnelLog, "--loglevel", "info") -PassThru -WindowStyle Hidden

$publicUrl = $null
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $tunnelLog) {
    $log = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
    if ($log -match "https://[a-z0-9-]+\.trycloudflare\.com") {
      $publicUrl = $Matches[0]
      break
    }
  }
}

$desktopCard = Join-Path ([Environment]::GetFolderPath("Desktop")) "PATIENT-VAULT-DEMO.txt"
$card = @"
MODERN MEDICINE — PATIENT VAULT DEMO
====================================

Website (share with doctors):
  $(if ($publicUrl) { $publicUrl } else { "Check the PowerShell window for the https://....trycloudflare.com link" })

Login:
  Email:    admin@clinic.local
  Password: ChangeMe123!

Other test users (same password):
  user@clinic.local
  firas.khamis@clinic.local
  nicholas.kalayeh@clinic.local

IMPORTANT: Keep the black PowerShell window open while doctors use the site.
Data saves to the cloud database. Close the window when the demo is over.
"@

Set-Content -Path $desktopCard -Value $card -Encoding UTF8

Write-Host ""
Write-Host "YOUR DEMO IS LIVE!" -ForegroundColor Green
Write-Host ""
if ($publicUrl) {
  Write-Host "  $publicUrl" -ForegroundColor Yellow
  Start-Process $publicUrl
} else {
  Write-Host "  Look in $tunnelLog for your https://....trycloudflare.com link" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Login saved to Desktop: PATIENT-VAULT-DEMO.txt" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Email:    admin@clinic.local" -ForegroundColor White
Write-Host "  Password: ChangeMe123!" -ForegroundColor White
Write-Host ""
Write-Host "Keep this window open during the demo. Press Ctrl+C to stop." -ForegroundColor Gray

try {
  while ($true) {
    if ($appJob.State -eq "Failed") {
      Write-Host "App stopped unexpectedly:" -ForegroundColor Red
      Receive-Job $appJob
      break
    }
    Start-Sleep -Seconds 5
  }
} finally {
  Stop-Job $appJob -ErrorAction SilentlyContinue
  Remove-Job $appJob -ErrorAction SilentlyContinue
  if ($tunnelProc -and -not $tunnelProc.HasExited) { $tunnelProc.Kill() }
}
