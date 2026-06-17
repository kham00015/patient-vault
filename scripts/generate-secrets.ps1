# Generate production secrets (run locally before AWS deploy)
# Usage: powershell -ExecutionPolicy Bypass -File scripts/generate-secrets.ps1

Write-Host "Patient Vault — Production Secrets" -ForegroundColor Cyan
Write-Host "Copy these into your AWS environment variables. Store them in a password manager." -ForegroundColor Yellow
Write-Host ""

$jwt = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
$enc = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])

Write-Host "JWT_SECRET=$jwt"
Write-Host "ENCRYPTION_KEY=$enc"
Write-Host ""
Write-Host "WARNING: Save ENCRYPTION_KEY permanently. If you lose it, encrypted patient data cannot be recovered." -ForegroundColor Red
