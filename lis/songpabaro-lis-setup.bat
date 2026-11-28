@echo off
title SongpaBaro chart reader (LIS) setup
echo.
echo  SongpaBaro - IntoVet chart reader (LIS) setup
echo  Downloading the latest version...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$t=Join-Path $env:TEMP 'sb-lis-setup\songpabaro-lis';if(Test-Path $t){Remove-Item $t -Recurse -Force};New-Item -ItemType Directory -Path $t -Force | Out-Null;$v=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds();foreach($f in 'sb-lis.ps1','jinstall.bat','jrun.bat','jcheck.bat','jdiag.bat'){Invoke-WebRequest -UseBasicParsing -Uri ('https://songpabaro-care.github.io/songpabaro-care/lis/'+$f+'?v='+$v) -OutFile (Join-Path $t $f)};if((Get-Item (Join-Path $t 'sb-lis.ps1')).Length -lt 3000){throw 'bad download'}"
if errorlevel 1 goto fail
if not exist "%TEMP%\sb-lis-setup\songpabaro-lis\jinstall.bat" goto fail
call "%TEMP%\sb-lis-setup\songpabaro-lis\jinstall.bat"
echo.
echo  Done. A check window is open.
echo  1) Approve "IntoVet chart reader" device in Care Note (lock icon) if asked.
echo  2) Open any chart in IntoVet and see that it is read.
echo  3) Close the check window, then press any key here.
echo     It keeps running quietly in the background (no window) and starts with Windows.
echo.
pause
start "" "C:\songpabaro-lis\jrun.bat"
goto end
:fail
echo.
echo  Download failed. Check the internet connection and try again.
pause
:end
