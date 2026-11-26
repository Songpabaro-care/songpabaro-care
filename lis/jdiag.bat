@echo off
title SongpaBaro reception diag
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sb-lis.ps1" -JDiag
