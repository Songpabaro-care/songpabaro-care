@echo off
title SongpaBaro LIS (diag)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sb-lis.ps1" -Diag
pause
