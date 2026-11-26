@echo off
title SongpaBaro LIS setup
set D=C:\songpabaro-lis
if not exist "%D%" mkdir "%D%"
taskkill /f /fi "WINDOWTITLE eq SongpaBaro LIS*" >nul 2>&1
copy /y "%~dp0sb-lis.ps1" "%D%\" >nul
copy /y "%~dp0run.bat" "%D%\" >nul
copy /y "%~dp0diag.bat" "%D%\" >nul
copy /y "%~dp0*.txt" "%D%\" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\SongpaBaro LIS.lnk');$s.TargetPath='C:\songpabaro-lis\run.bat';$s.WorkingDirectory='C:\songpabaro-lis';$s.WindowStyle=7;$s.Save()"
echo.
echo  [OK] Installed to C:\songpabaro-lis  (auto start on Windows login)
echo  Starting diagnostic window...
start "" "C:\songpabaro-lis\diag.bat"
timeout /t 5 >nul
