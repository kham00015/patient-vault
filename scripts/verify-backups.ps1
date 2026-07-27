# Verify RDS automated backups and report status.
# Usage: .\scripts\verify-backups.ps1

$ErrorActionPreference = "Stop"
$region = "us-east-1"
$dbId = "patient-vault-db"

Write-Host "Patient Vault - Backup Verification" -ForegroundColor Cyan
Write-Host ""

$dbQuery = 'DBInstances[0].{Status:DBInstanceStatus,BackupRetention:BackupRetentionPeriod,Encrypted:StorageEncrypted,LatestRestorable:LatestRestorableTime}'
$dbJson = aws rds describe-db-instances `
  --db-instance-identifier $dbId `
  --region $region `
  --query $dbQuery `
  --output json
$db = $dbJson | ConvertFrom-Json

Write-Host "RDS instance: $dbId" -ForegroundColor Green
Write-Host "  Status:              $($db.Status)"
Write-Host "  Backup retention:      $($db.BackupRetention) days"
Write-Host "  Storage encrypted:     $($db.Encrypted)"
Write-Host "  Latest restorable to:  $($db.LatestRestorableTime)"

$snapQuery = 'reverse(sort_by(DBSnapshots,&SnapshotCreateTime))[0:5].{Id:DBSnapshotIdentifier,Status:Status,Created:SnapshotCreateTime}'
$snapJson = aws rds describe-db-snapshots `
  --db-instance-identifier $dbId `
  --region $region `
  --query $snapQuery `
  --output json
$snapshots = $snapJson | ConvertFrom-Json

Write-Host ""
Write-Host "Recent snapshots:" -ForegroundColor Green
foreach ($s in $snapshots) {
  Write-Host "  $($s.Created)  $($s.Status)  $($s.Id)"
}

$ok = $db.BackupRetention -ge 7 -and $db.Encrypted -eq $true -and $snapshots.Count -gt 0
Write-Host ""
if ($ok) {
  Write-Host "BACKUP CHECK: PASSED" -ForegroundColor Green
  exit 0
}

Write-Host "BACKUP CHECK: REVIEW NEEDED (retention under 7 days or no snapshots)" -ForegroundColor Yellow
exit 1
