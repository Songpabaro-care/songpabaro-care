@echo off
chcp 65001 >nul
title 송파바로 LIS 연동 (진단)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sb-lis.ps1" -Diag
pause
