@echo off
setlocal
rem Use the shared script relative to this launcher. Bypass is process-local.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Jellyfish.ps1" -Action Push %*
set "JELLYFISH_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %JELLYFISH_EXIT%
