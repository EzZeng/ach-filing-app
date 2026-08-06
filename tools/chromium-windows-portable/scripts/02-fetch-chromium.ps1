#Requires -Version 5.1
<#
.SYNOPSIS
  Fetch Chromium source with depot_tools (Windows).
#>
[CmdletBinding()]
param(
  [string]$ChromiumRoot = 'C:\src\chromium',
  [switch]$NoHistory,
  [switch]$GitCache
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command fetch -ErrorAction SilentlyContinue)) {
  throw 'fetch not found. Install depot_tools and put it first on PATH (cmd.exe).'
}

New-Item -ItemType Directory -Force -Path $ChromiumRoot | Out-Null
Set-Location $ChromiumRoot

$fetchArgs = @('chromium')
if ($NoHistory) { $fetchArgs = @('--no-history') + $fetchArgs }
if ($GitCache) { $fetchArgs = @('--git-cache') + $fetchArgs }

Write-Host "Running: fetch $($fetchArgs -join ' ')" -ForegroundColor Cyan
Write-Host 'This can take hours. Keep the PC awake.' -ForegroundColor Yellow
& fetch @fetchArgs
if ($LASTEXITCODE -ne 0) { throw "fetch failed with exit $LASTEXITCODE" }
Write-Host "Done. Continue in: $(Join-Path $ChromiumRoot 'src')" -ForegroundColor Green
