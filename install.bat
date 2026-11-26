@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch.ps1" install %*
set "result=%errorlevel%"
if not "%result%"=="0" (
  echo.
  echo Failed with exit code %result%. Review the message above.
  pause
)
exit /b %result%
