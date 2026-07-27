# Configure S3 document storage for production.
# Usage: .\scripts\setup-s3-production.ps1 -BucketName patient-vault-docs-885362002526
#
# If bucket does not exist, create it in AWS Console first (see steps below).

param(
  [string]$BucketName = "patient-vault-docs-aloha-885362002526",
  [string]$AccessKeyId,
  [string]$SecretAccessKey
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$region = "us-east-1"

Write-Host "Patient Vault - S3 Setup" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Create bucket in AWS Console (if not done):" -ForegroundColor Yellow
Write-Host "  https://s3.console.aws.amazon.com/s3/bucket/create?region=$region"
Write-Host "  Bucket name: $BucketName"
Write-Host "  Block ALL public access: ON"
Write-Host "  Versioning: Enable"
Write-Host "  Encryption: SSE-S3 (AES-256)"
Write-Host ""

$created = $false
try {
  aws s3api head-bucket --bucket $BucketName --region $region 2>$null
  Write-Host "Bucket exists: $BucketName" -ForegroundColor Green
} catch {
  Write-Host "Creating bucket via CLI..." -ForegroundColor Cyan
  try {
    aws s3api create-bucket --bucket $BucketName --region $region | Out-Null
    $created = $true
    Write-Host "Created bucket: $BucketName" -ForegroundColor Green
  } catch {
    Write-Host "Could not create bucket via CLI. Create it manually in AWS Console (steps above)." -ForegroundColor Red
    Write-Host "Then re-run: .\scripts\setup-s3-production.ps1 -BucketName $BucketName"
    exit 1
  }
}

if ($created) {
  aws s3api put-public-access-block --bucket $BucketName --public-access-block-configuration `
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" | Out-Null
  aws s3api put-bucket-versioning --bucket $BucketName --versioning-configuration Status=Enabled | Out-Null
  aws s3api put-bucket-encryption --bucket $BucketName --server-side-encryption-configuration `
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' | Out-Null
  Write-Host "Applied: block public access, versioning, encryption" -ForegroundColor Green
}

if (-not $AccessKeyId) {
  Write-Host ""
  Write-Host "Step 2: IAM access keys for the app server" -ForegroundColor Yellow
  Write-Host "  AWS Console > IAM > Users > patient-vault-cli > Security credentials"
  Write-Host "  Create access key, attach policy from iam/app-s3-policy.json"
  Write-Host ""
  $AccessKeyId = Read-Host "Paste AWS_ACCESS_KEY_ID (or Enter to skip)"
  if ($AccessKeyId) {
    $secure = Read-Host "Paste AWS_SECRET_ACCESS_KEY" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $SecretAccessKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  }
}

function Set-EnvFileValue {
  param([string]$Path, [hashtable]$Updates)
  $content = if (Test-Path $Path) { Get-Content $Path -Raw } else { "" }
  foreach ($key in $Updates.Keys) {
    $val = $Updates[$key]
    if ($content -match "${key}=`"[^`"]*`"") {
      $content = $content -replace "${key}=`"[^`"]*`"", "${key}=`"$val`""
    } else {
      if ($content -and -not $content.EndsWith("`n")) { $content += "`n" }
      $content += "${key}=`"$val`"`n"
    }
  }
  Set-Content -Path $Path -Value $content.TrimEnd() -Encoding UTF8
}

$prodEnv = Join-Path $root ".env.production"
$stagingEnv = Join-Path $root "staging.env"
if (-not (Test-Path $prodEnv)) {
  & (Join-Path $PSScriptRoot "prepare-production-env.ps1")
}

$updates = @{
  'STORAGE_TYPE' = 's3'
  'AWS_REGION' = $region
  'AWS_S3_BUCKET' = $BucketName
}
if ($AccessKeyId -and $SecretAccessKey) {
  $updates['AWS_ACCESS_KEY_ID'] = $AccessKeyId
  $updates['AWS_SECRET_ACCESS_KEY'] = $SecretAccessKey
}

Set-EnvFileValue -Path $prodEnv -Updates $updates
Set-EnvFileValue -Path $stagingEnv -Updates $updates
Write-Host ""
Write-Host "Updated .env.production and staging.env for S3" -ForegroundColor Green
Write-Host "Next: .\scripts\apply-production-hardening.ps1"
