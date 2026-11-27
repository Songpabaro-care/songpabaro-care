@echo off
title SongpaBaro chart reader (LIS) setup
echo.
echo  SongpaBaro - IntoVet chart reader (LIS) setup
echo  Downloading the latest version...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$t=Join-Path $env:TEMP 'sb-lis-setup';if(Test-Path $t){Remove-Item $t -Recurse -Force};New-Item -ItemType Directory -Path $t | Out-Null;$u='https://songpabaro-care.github.io/songpabaro-care/lis/songpabaro-lis.zip?v='+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds();Invoke-WebRequest -UseBasicParsing -Uri $u -OutFile (Join-Path $t 'lis.zip');Expand-Archive -Path (Join-Path $t 'lis.zip') -DestinationPath $t -Force"
if errorlevel 1 goto fail
if not exist "%TEMP%\sb-lis-setup\songpabaro-lis\jinstall.bat" goto fail
call "%TEMP%\sb-lis-setup\songpabaro-lis\jinstall.bat"
echo.
echo  Done. A check window is open.
echo  1) Approve "IntoVet chart reader" device in Care Note (lock icon) if asked.
echo  2) Open any chart in IntoVet and see that it is read.
echo  3) Close the check window and restart this PC. It will run quietly from then on.
echo.
pause
goto end
:fail
echo.
echo  Download failed. Check the internet connection and try again.
pause
:end
