#Requires -Version 5.1
<#
.SYNOPSIS
  gn gen out\Portable with release / portable-friendly args.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SrcDir,
  [string]$OutName = 'Portable',
  [string]$ArgsFile = ''
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path (Join-Path $SrcDir 'BUILD.gn'))) {
  throw "Not a Chromium src dir: $SrcDir"
}
if (-not (Get-Command gn -ErrorAction SilentlyContinue)) {
  throw 'gn not found. Ensure depot_tools is on PATH and you are in the Chromium env.'
}

Set-Location $SrcDir
$outRel = "out\$OutName"

$defaultArgs = @(
  'is_debug=false',
  'is_component_build=false',
  'is_official_build=true',
  'symbol_level=0',
  'blink_symbol_level=0',
  'v8_symbol_level=0',
  'enable_nacl=false'
) -join ' '

if ($ArgsFile -and (Test-Path $ArgsFile)) {
  # Strip comments for --args
  $raw = Get-Content $ArgsFile -Raw
  $lines = $raw -split "`r?`n" | Where-Object { $_ -notmatch '^\s*#' -and $_.Trim() -ne '' }
  $argString = ($lines -join ' ')
} else {
  $argString = $defaultArgs
}

Write-Host "gn gen $outRel --args=..." -ForegroundColor Cyan
& gn gen $outRel --args=$argString
if ($LASTEXITCODE -ne 0) { throw "gn gen failed with exit $LASTEXITCODE" }
Write-Host "Generated $outRel" -ForegroundColor Green
