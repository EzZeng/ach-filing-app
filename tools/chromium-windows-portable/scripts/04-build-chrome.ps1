#Requires -Version 5.1
<#
.SYNOPSIS
  Build chrome target for portable packaging.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SrcDir,
  [string]$OutName = 'Portable',
  [switch]$MiniInstaller
)

$ErrorActionPreference = 'Stop'
Set-Location $SrcDir
$outRel = "out\$OutName"
$target = if ($MiniInstaller) { 'mini_installer' } else { 'chrome' }

if (-not (Get-Command autoninja -ErrorAction SilentlyContinue)) {
  throw 'autoninja not found. Ensure depot_tools is on PATH.'
}

Write-Host "autoninja -C $outRel $target" -ForegroundColor Cyan
& autoninja -C $outRel $target
if ($LASTEXITCODE -ne 0) { throw "autoninja failed with exit $LASTEXITCODE" }
Write-Host "Built: $SrcDir\$outRel\chrome.exe" -ForegroundColor Green
