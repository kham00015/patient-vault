$ErrorActionPreference = "Continue"
Write-Host "=== WIA scanners (what Patient Vault Scan uses) ==="
try {
  $m = New-Object -ComObject WIA.DeviceManager
  $count = 0
  foreach ($info in $m.DeviceInfos) {
    if ($info.Type -eq 1) {
      $count++
      $name = "Scanner"
      try { $name = $info.Properties("Name").Value } catch {}
      Write-Host "FOUND: $name"
      Write-Host "  ID: $($info.DeviceID)"
    }
  }
  if ($count -eq 0) { Write-Host "NONE — Windows WIA does not see a scanner right now." }
} catch {
  Write-Host "WIA error: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=== Other imaging devices Windows knows about ==="
Get-PnpDevice -Class Image -ErrorAction SilentlyContinue |
  Select-Object -First 20 FriendlyName, Status |
  Format-Table -AutoSize |
  Out-String |
  Write-Host
