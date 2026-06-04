@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\run-vending-price-check.ps1"
exit /b %errorlevel%
