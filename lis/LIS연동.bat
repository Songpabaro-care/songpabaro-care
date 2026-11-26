@echo off
chcp 65001 >nul
title 송파바로 LIS 연동
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "%~dp0sb-lis.ps1"
