# Load staging.env into the current process environment.
param([string]$EnvFile = (Join-Path (Split-Path $PSScriptRoot -Parent) "staging.env"))

if (-not (Test-Path $EnvFile)) {
  Write-Error "Env file not found: $EnvFile"
}

Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $name = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim().Trim('"')
  Set-Item -Path "env:$name" -Value $value
}

Write-Host "Loaded $EnvFile" -ForegroundColor Green
