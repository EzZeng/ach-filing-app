@echo off
setlocal
cd /d "%~dp0"
REM When copied next to chrome.exe, %~dp0 is the portable root.
REM When used from the repo launcher/ folder, pass -Root or run after packaging.
set "ROOT=%~dp0"
if exist "%ROOT%chrome.exe" goto :run
if exist "%ROOT%..\chrome.exe" (
  set "ROOT=%ROOT%..\"
  goto :run
)
echo chrome.exe not found next to this launcher. Place ChromiumPortable.bat beside chrome.exe.
exit /b 1

:run
set "UD=%ROOT%UserData"
if not exist "%UD%" mkdir "%UD%"
start "" "%ROOT%chrome.exe" ^
  --user-data-dir="%UD%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-features=TranslateUI ^
  --disk-cache-dir="%UD%\Cache" ^
  --disable-breakpad ^
  %*
