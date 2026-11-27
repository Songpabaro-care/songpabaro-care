@echo off
title SongpaBaro IntoVet setup
if /i "%~1"=="remove" goto rm
echo  Installing... (needs internet)
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $f=Join-Path $env:TEMP 'sb-intovet-setup.ps1'; Invoke-WebRequest -UseBasicParsing -Uri ('https://songpabaro-care.github.io/songpabaro-care/intovet/setup.ps1?v='+[DateTime]::Now.Ticks) -OutFile $f; & $f"
echo.
pause
exit /b
:rm
taskkill /f /im sbdock.exe >nul 2>&1
reg delete "HKCU\Software\Classes\sbintovet" /f >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SongpaBaro Chat Dock.lnk" >nul 2>&1
echo  Removed.
pause
