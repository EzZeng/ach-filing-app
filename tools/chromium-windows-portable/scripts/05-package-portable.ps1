#Requires -Version 5.1
<#
.SYNOPSIS
  Copy a Chromium out\ directory into a portable folder with launchers.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BuildDir,
  [Parameter(Mandatory = $true)]
  [string]$OutDir,
  [switch]$Zip
)

$ErrorActionPreference = 'Stop'
$chrome = Join-Path $BuildDir 'chrome.exe'
if (-not (Test-Path $chrome)) {
  throw "chrome.exe not found in $BuildDir — build chrome first."
}

$scriptRoot = Split-Path -Parent $PSScriptRoot
$launcherDir = Join-Path $scriptRoot 'launcher'

Write-Host "Packaging portable from $BuildDir -> $OutDir" -ForegroundColor Cyan
if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Prefer robocopy for large trees; exclude PDBs and test binaries.
$robocopyArgs = @(
  $BuildDir, $OutDir, '/E',
  '/XF', '*.pdb',
  'interactive_ui_tests.exe', 'unit_tests.exe', 'browser_tests.exe',
  'setup.exe', 'mini_installer.exe',
  '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np'
)
& robocopy @robocopyArgs | Out-Null
# robocopy exit codes 0-7 are success-ish
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit $LASTEXITCODE" }

New-Item -ItemType Directory -Force -Path (Join-Path $OutDir 'UserData') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $OutDir 'Downloads') | Out-Null

Copy-Item (Join-Path $launcherDir 'ChromiumPortable.bat') $OutDir -Force
Copy-Item (Join-Path $launcherDir 'ChromiumPortable.ps1') $OutDir -Force

@"
Chromium Windows Portable (source build)
========================================
Built from: $BuildDir
Packaged:   $(Get-Date -Format o)

Double-click ChromiumPortable.bat
Profile lives in .\UserData
"@ | Set-Content -Path (Join-Path $OutDir 'README.txt') -Encoding UTF8

if ($Zip) {
  $zipPath = "$OutDir.zip"
  if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
  Compress-Archive -Path $OutDir -DestinationPath $zipPath -CompressionLevel Optimal
  Write-Host "Zip: $zipPath" -ForegroundColor Green
}

Write-Host "Portable ready: $OutDir" -ForegroundColor Green
