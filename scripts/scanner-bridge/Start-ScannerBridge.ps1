# Patient Vault local scanner bridge (Windows WIA).
# Run on the clinic PC that has the scanner plugged in (same machine as the browser).
# Usage:
#   cd C:\Users\Firas\patient-vault
#   npm run scanner-bridge
#
# Or:
#   powershell -ExecutionPolicy Bypass -File .\scripts\scanner-bridge\Start-ScannerBridge.ps1
#
# Keep this window open. The EMR Scan button talks to http://127.0.0.1:18991

param(
  [int]$Port = 18991
)

$ErrorActionPreference = "Stop"
$prefix = "http://127.0.0.1:$Port/"

function Write-JsonResponse {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [int]$StatusCode,
    [object]$Body
  )
  $json = ($Body | ConvertTo-Json -Compress -Depth 8)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.Headers.Add("Access-Control-Allow-Origin", "*")
  $Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  $Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Access-Control-Request-Private-Network")
  $Response.Headers.Add("Access-Control-Allow-Private-Network", "true")
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.OutputStream.Close()
}

function Get-ScannerDevices {
  $devices = New-Object System.Collections.ArrayList
  try {
    $manager = New-Object -ComObject WIA.DeviceManager
    foreach ($info in $manager.DeviceInfos) {
      # 1 = Scanner
      if ($info.Type -eq 1) {
        $name = "Scanner"
        try { $name = [string]$info.Properties.Item("Name").Value } catch {}
        [void]$devices.Add([pscustomobject]@{
          id = [string]$info.DeviceID
          name = $name
        })
      }
    }
  } catch {
    # return empty list
  }
  return $devices.ToArray()
}

function Save-WiaImage($image) {
  $tempDir = Join-Path $env:TEMP "patient-vault-scanner"
  New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
  $guid = [guid]::NewGuid().ToString("N")
  $rawFile = Join-Path $tempDir ("scan-raw-" + $guid + ".bmp")
  $jpgFile = Join-Path $tempDir ("scan-" + $guid + ".jpg")

  # Always save raw first, then convert to JPEG (keeps uploads small).
  $image.SaveFile($rawFile)

  $finalFile = $null
  $ext = "jpg"
  $mime = "image/jpeg"

  try {
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $img = [System.Drawing.Image]::FromFile($rawFile)
    try {
      $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" } | Select-Object -First 1
      $encoder = [System.Drawing.Imaging.Encoder]::Quality
      $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
      $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, 85L)
      $img.Save($jpgFile, $codec, $params)
      $finalFile = $jpgFile
    } finally {
      $img.Dispose()
    }
  } catch {
    # Fallback: WIA JPEG convert filter
    try {
      $process = New-Object -ComObject WIA.ImageProcess
      $null = $process.Filters.Add($process.FilterInfos.Item("Convert").FilterID)
      $process.Filters.Item(1).Properties.Item("FormatID").Value = "{B96B3CAE-0728-11D3-9D7E-0000F81EF32E}"
      $converted = $process.Apply($image)
      $converted.SaveFile($jpgFile)
      $finalFile = $jpgFile
    } catch {
      $finalFile = $rawFile
      $ext = "bmp"
      $mime = "image/bmp"
    }
  }

  if (-not (Test-Path $finalFile)) {
    throw "Scanner returned no image file."
  }

  $fileBytes = [System.IO.File]::ReadAllBytes($finalFile)
  $b64 = [Convert]::ToBase64String($fileBytes)

  Remove-Item -Force $rawFile,$jpgFile -ErrorAction SilentlyContinue

  return [pscustomobject]@{
    cancelled = $false
    fileName = ("scan." + $ext)
    mimeType = $mime
    base64 = $b64
    byteLength = $fileBytes.Length
  }
}

function Invoke-WiaScan {
  param(
    [string]$DeviceId = ""
  )

  $manager = New-Object -ComObject WIA.DeviceManager
  $info = $null

  if ($DeviceId) {
    foreach ($candidate in $manager.DeviceInfos) {
      if ($candidate.Type -eq 1 -and [string]$candidate.DeviceID -eq $DeviceId) {
        $info = $candidate
        break
      }
    }
    if (-not $info) {
      throw "Selected scanner was not found. Click Search again and pick another device."
    }
  } else {
    foreach ($candidate in $manager.DeviceInfos) {
      if ($candidate.Type -eq 1) {
        $info = $candidate
        break
      }
    }
    if (-not $info) {
      throw "No scanner found."
    }
  }

  $name = "Scanner"
  try { $name = [string]$info.Properties.Item("Name").Value } catch {}
  Write-Host ("Using scanner: " + $name)

  # Direct scan from the chosen device (much faster than the generic Windows picker).
  $device = $info.Connect()
  if ($device.Items.Count -lt 1) {
    throw "Scanner has no scan source."
  }
  $item = $device.Items.Item(1)

  try {
    # Prefer color / reasonable DPI when the driver exposes these properties.
    foreach ($prop in $item.Properties) {
      try {
        if ($prop.PropertyID -eq 6147) { $prop.Value = 200 }      # Horizontal resolution
        elseif ($prop.PropertyID -eq 6148) { $prop.Value = 200 } # Vertical resolution
        elseif ($prop.PropertyID -eq 6146) { $prop.Value = 1 }   # Color intent (1=Color)
      } catch {}
    }
  } catch {}

  $image = $null
  try {
    $image = $item.Transfer()
  } catch {
    # Some drivers need the CommonDialog transfer UI for that device only.
    $dialog = New-Object -ComObject WIA.CommonDialog
    $image = $dialog.ShowTransfer($item)
  }

  if (-not $image) {
    return [pscustomobject]@{ cancelled = $true }
  }

  return Save-WiaImage $image
}

try {
  $null = Start-Process -FilePath "netsh" -ArgumentList @("http", "add", "urlacl", ("url=" + $prefix), ("user=" + $env:USERNAME)) -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue
} catch {}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host ("Could not bind " + $prefix) -ForegroundColor Red
  Write-Host "Try running PowerShell as Administrator once, or another port:" -ForegroundColor Yellow
  Write-Host "  .\scripts\scanner-bridge\Start-ScannerBridge.ps1 -Port 18992"
  Write-Host $_.Exception.Message
  exit 1
}

Write-Host ""
Write-Host "Patient Vault Scanner Bridge" -ForegroundColor Cyan
Write-Host ("Listening on " + $prefix) -ForegroundColor Green
Write-Host "Keep this window open while scanning from the EMR." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop."
Write-Host ""

$devices = Get-ScannerDevices
if ($devices.Count -eq 0) {
  Write-Host "No WIA scanners detected yet. Plug in / power on the scanner and install its Windows driver." -ForegroundColor Yellow
} else {
  Write-Host "Detected scanners:" -ForegroundColor Green
  foreach ($d in $devices) {
    Write-Host ("  - " + $d.name)
  }
}
Write-Host ""

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $req = $context.Request
  $res = $context.Response

  if ($req.HttpMethod -eq "OPTIONS") {
    $res.StatusCode = 204
    $res.Headers.Add("Access-Control-Allow-Origin", "*")
    $res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $res.Close()
    continue
  }

  $path = $req.Url.AbsolutePath.TrimEnd("/").ToLowerInvariant()
  try {
    if ($req.HttpMethod -eq "GET" -and ($path -eq "" -or $path -eq "/status")) {
      $list = @(Get-ScannerDevices)
      $payload = [ordered]@{
        ok = $true
        service = "patient-vault-scanner-bridge"
        port = $Port
        scannerCount = $list.Length
        scanners = @($list)
      }
      Write-JsonResponse -Response $res -StatusCode 200 -Body $payload
      continue
    }

    if ($req.HttpMethod -eq "GET" -and $path -eq "/devices") {
      $list = @(Get-ScannerDevices)
      Write-JsonResponse -Response $res -StatusCode 200 -Body ([ordered]@{
        scanners = @($list)
      })
      continue
    }

    if ($req.HttpMethod -eq "POST" -and $path -eq "/scan") {
      $stamp = Get-Date -Format "HH:mm:ss"
      $deviceId = ""
      try {
        $reader = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
        $raw = $reader.ReadToEnd()
        $reader.Close()
        if ($raw) {
          $parsed = $raw | ConvertFrom-Json
          if ($parsed.deviceId) { $deviceId = [string]$parsed.deviceId }
        }
      } catch {}

      Write-Host ("[" + $stamp + "] Scan requested for device: " + $(if ($deviceId) { $deviceId } else { "(default)" }))
      $result = Invoke-WiaScan -DeviceId $deviceId
      if ($result.cancelled) {
        Write-Host "Scan cancelled by user." -ForegroundColor Yellow
        Write-JsonResponse -Response $res -StatusCode 200 -Body ([pscustomobject]@{
          ok = $false
          cancelled = $true
        })
      } else {
        Write-Host ("Scan OK (" + $result.byteLength + " bytes)") -ForegroundColor Green
        Write-JsonResponse -Response $res -StatusCode 200 -Body ([pscustomobject]@{
          ok = $true
          cancelled = $false
          fileName = $result.fileName
          mimeType = $result.mimeType
          base64 = $result.base64
        })
      }
      continue
    }

    Write-JsonResponse -Response $res -StatusCode 404 -Body ([pscustomobject]@{
      ok = $false
      error = "Not found"
    })
  } catch {
    Write-Host ("Scan error: " + $_.Exception.Message) -ForegroundColor Red
    Write-JsonResponse -Response $res -StatusCode 500 -Body ([pscustomobject]@{
      ok = $false
      error = $_.Exception.Message
    })
  }
}
