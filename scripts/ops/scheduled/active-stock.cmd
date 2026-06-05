@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\run-active-stock.ps1"
exit /b %errorlevel%
