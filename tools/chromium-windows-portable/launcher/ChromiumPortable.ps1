# Portable Chromium launcher (place next to chrome.exe after packaging).
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $Root 'chrome.exe'))) {
  $parent = Split-Path -Parent $Root
  if (Test-Path (Join-Path $parent 'chrome.exe')) { $Root = $parent }
  else { throw 'chrome.exe not found next to this launcher.' }
}
$UserData = Join-Path $Root 'UserData'
New-Item -ItemType Directory -Force -Path $UserData | Out-Null
$Chrome = Join-Path $Root 'chrome.exe'
$Args = @(
  "--user-data-dir=$UserData",
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=TranslateUI',
  "--disk-cache-dir=$(Join-Path $UserData 'Cache')",
  '--disable-breakpad'
) + $args
Start-Process -FilePath $Chrome -ArgumentList $Args -WorkingDirectory $Root
