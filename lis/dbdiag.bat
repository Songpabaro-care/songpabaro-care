@echo off
title SongpaBaro DB diag
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sb-lis.ps1" -DbDiag
