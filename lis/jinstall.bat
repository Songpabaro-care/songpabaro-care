@echo off
title SongpaBaro Reception setup
set D=C:\songpabaro-lis
if not exist "%D%" mkdir "%D%"
taskkill /f /fi "WINDOWTITLE eq SongpaBaro Reception*" >nul 2>&1
copy /y "%~dp0*.ps1" "%D%\" >nul
copy /y "%~dp0*.bat" "%D%\" >nul
copy /y "%~dp0*.txt" "%D%\" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\SongpaBaro Reception.lnk');$s.TargetPath='C:\songpabaro-lis\jrun.bat';$s.WorkingDirectory='C:\songpabaro-lis';$s.WindowStyle=7;$s.Save()"
echo.
echo  [OK] Reception mode installed (auto start on Windows login)
start "" "C:\songpabaro-lis\jcheck.bat"
timeout /t 5 >nul
