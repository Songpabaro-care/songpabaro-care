@echo off
title SongpaBaro Reception (diag)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sb-lis.ps1" -Reception -Diag
pause
