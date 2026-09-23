@echo off
echo [%date% %time%] launcher cmd invoked by user >> "%~dp0local-browser\logs\desktop-host-launch.log"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Start-WebDesktop.ps1" -RegisterLogon
echo [%date% %time%] launcher cmd finished, errorlevel=%errorlevel% >> "%~dp0local-browser\logs\desktop-host-launch.log"
echo Desktop host launcher finished. Check web page status in a few seconds.
pause
