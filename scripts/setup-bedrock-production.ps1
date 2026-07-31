# Configure AWS Bedrock for Patient Vault Ask AI (local + production).
# Usage: .\scripts\setup-bedrock-production.ps1

$ErrorActionPreference = "Stop"
$region = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }
$modelId = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
$root = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "AWS Bedrock setup for Ask AI ($region)" -ForegroundColor Cyan
Write-Host "Model: $modelId"
Write-Host ""
Write-Host "1) AWS Console -> Amazon Bedrock -> Model access" -ForegroundColor Yellow
Write-Host "   Enable Anthropic Claude Sonnet 4.5 (or Sonnet 4.6) in $region."
Write-Host "   Older Claude 3.5 Sonnet IDs are end-of-life and will fail."
Write-Host ""
Write-Host "2) IAM policy for the app user / Lightsail instance role:" -ForegroundColor Yellow

$policy = @'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockConverse",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:Converse",
        "bedrock:ConverseStream"
      ],
      "Resource": "*"
    },
    {
      "Sid": "TranscribeMedicalListen",
      "Effect": "Allow",
      "Action": [
        "transcribe:StartMedicalStreamTranscription"
      ],
      "Resource": "*"
    }
  ]
}
'@
Write-Host $policy

Write-Host "3) Env vars required in .env.local and .env.production:" -ForegroundColor Yellow
Write-Host "   AWS_REGION=$region"
Write-Host "   BEDROCK_MODEL_ID=$modelId"
Write-Host "   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  (or AWS_USE_INSTANCE_ROLE=1)"
Write-Host ""
Write-Host "4) AI Listen also needs Amazon Transcribe Medical enabled in $region" -ForegroundColor Yellow
Write-Host "   and IAM action transcribe:StartMedicalStreamTranscription (included above)."
Write-Host ""
Write-Host "5) Redeploy production so the container gets the new dependency + env." -ForegroundColor Yellow
Write-Host ""

function Ensure-BedrockEnv([string]$path) {
  if (-not (Test-Path $path)) { return }
  $lines = Get-Content $path
  $hasModel = $false
  foreach ($line in $lines) {
    if ($line -match '^\s*BEDROCK_MODEL_ID=') { $hasModel = $true }
  }
  if (-not $hasModel) {
    Add-Content -Path $path -Value ""
    Add-Content -Path $path -Value "# AWS Bedrock Ask AI"
    Add-Content -Path $path -Value "BEDROCK_MODEL_ID=`"$modelId`""
    Write-Host "Added BEDROCK_MODEL_ID to $(Split-Path $path -Leaf)" -ForegroundColor Green
  } else {
    Write-Host "$(Split-Path $path -Leaf) already has BEDROCK_MODEL_ID" -ForegroundColor DarkGray
  }
}

Ensure-BedrockEnv (Join-Path $root ".env.local")
Ensure-BedrockEnv (Join-Path $root ".env.production")
Ensure-BedrockEnv (Join-Path $root "staging.env")

Write-Host "Done. Local test: open a chart, Ask AI, ask about PFTs or documents." -ForegroundColor Green
