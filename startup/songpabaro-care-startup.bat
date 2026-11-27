@echo off
title SongpaBaro Care Note - auto start
set "SBL=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SongpaBaro Care Note.lnk"
set "SBU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SongpaBaro Care Note.url"
if /i "%~1"=="remove" goto rm
set "CH="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CH if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CH if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
del "%SBL%" >nul 2>&1
del "%SBU%" >nul 2>&1
if not defined CH goto nochrome
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:SBL); $s.TargetPath=$env:CH; $s.Arguments='--new-window https://songpabaro-care.github.io/songpabaro-care/'; $s.Description='SongpaBaro Care Note'; $s.Save()"
echo  Chrome found.
goto check
:nochrome
> "%SBU%" echo [InternetShortcut]
>> "%SBU%" echo URL=https://songpabaro-care.github.io/songpabaro-care/
echo  Chrome not found - Care Note will open in the default browser.
:check
echo.
if exist "%SBL%" echo  Auto start : OK  [Chrome]
if exist "%SBU%" echo  Auto start : OK  [default browser]
if not exist "%SBL%" if not exist "%SBU%" echo  Auto start : FAILED - take a photo of this window
echo  Care Note will open when this PC starts.
echo  To undo: Win+R, type shell:startup, delete "SongpaBaro Care Note".
echo.
pause
exit /b
:rm
del "%SBL%" >nul 2>&1
del "%SBU%" >nul 2>&1
echo  Removed. Care Note will no longer open at startup.
pause
