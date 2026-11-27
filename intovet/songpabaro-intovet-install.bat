@echo off
title SongpaBaro IntoVet setup
if /i "%~1"=="remove" goto rm
echo  [1/3] Downloading setup (needs internet)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $f=Join-Path $env:TEMP 'sb-intovet-setup.ps1'; Invoke-WebRequest -UseBasicParsing -Uri ('https://songpabaro-care.github.io/songpabaro-care/intovet/setup.ps1?v='+[DateTime]::Now.Ticks) -OutFile $f; Write-Host ('  downloaded ' + (Get-Item $f).Length + ' bytes'); Write-Host '  [2/3] Installing...'; $ErrorActionPreference='Continue'; & $f } catch { Write-Host ('  ERROR: ' + $_.Exception.Message) -ForegroundColor Red }"
echo.
echo  [3/3] Check
if exist "%LOCALAPPDATA%\songpabaro-intovet\sbintovet.exe" (echo    IntoVet button : OK fast) else (if exist "%LOCALAPPDATA%\songpabaro-intovet\go.vbs" (echo    IntoVet button : OK normal) else (echo    IntoVet button : MISSING))
if exist "%LOCALAPPDATA%\songpabaro-intovet\sbdock.exe" (echo    Chat dock      : OK) else (echo    Chat dock      : MISSING)
tasklist /fi "imagename eq sbdock.exe" 2>nul | find /i "sbdock.exe" >nul && (echo    Chat dock run  : running) || (echo    Chat dock run  : NOT running)
echo.
echo  Take a photo of this window if anything says MISSING / ERROR / NOT running.
pause
exit /b
:rm
taskkill /f /im sbdock.exe >nul 2>&1
reg delete "HKCU\Software\Classes\sbintovet" /f >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SongpaBaro Chat Dock.lnk" >nul 2>&1
echo  Removed.
pause
