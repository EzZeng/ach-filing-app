#Requires -Version 5.1
<#
.SYNOPSIS
  Verify Windows environment for building Chromium (portable release).
.NOTES
  Based on:
  https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md
#>
[CmdletBinding()]
param(
  [string]$DepotTools = 'C:\src\depot_tools'
)

$ErrorActionPreference = 'Continue'
Write-Host '=== Chromium Windows build environment check ===' -ForegroundColor Cyan

function Test-Cmd($Name) {
  $c = Get-Command $Name -ErrorAction SilentlyContinue
  if ($c) { Write-Host "[OK] $Name -> $($c.Source)" -ForegroundColor Green; return $true }
  Write-Host "[MISSING] $Name" -ForegroundColor Red
  return $false
}

Test-Cmd git | Out-Null
Test-Cmd python3 | Out-Null

$path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
        [Environment]::GetEnvironmentVariable('Path', 'Machine')
if ($path -like "*$DepotTools*") {
  Write-Host "[OK] depot_tools on PATH ($DepotTools)" -ForegroundColor Green
} else {
  Write-Host "[WARN] depot_tools not found on PATH. Add $DepotTools to the FRONT of PATH." -ForegroundColor Yellow
}

$dt = [Environment]::GetEnvironmentVariable('DEPOT_TOOLS_WIN_TOOLCHAIN', 'User')
if ($dt -eq '0') {
  Write-Host '[OK] DEPOT_TOOLS_WIN_TOOLCHAIN=0' -ForegroundColor Green
} else {
  Write-Host '[WARN] Set DEPOT_TOOLS_WIN_TOOLCHAIN=0 (use local Visual Studio).' -ForegroundColor Yellow
}

$vs = [Environment]::GetEnvironmentVariable('vs2026_install', 'User')
if ($vs) {
  Write-Host "[OK] vs2026_install=$vs" -ForegroundColor Green
} else {
  Write-Host '[INFO] Optional: set vs2026_install to your VS 2026 install path.' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host 'Required (manual): Visual Studio 2026 + Desktop C++ + MFC/ATL + Windows 11 SDK'
Write-Host 'First gclient bootstrap must run from cmd.exe, not PowerShell.'
Write-Host 'See tools/chromium-windows-portable/README.md'
