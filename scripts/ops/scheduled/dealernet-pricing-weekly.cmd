@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\run-dealernet-pricing.ps1" -Profile weekly -IncludeReview -IncludeAlerts -AlertMax 25
exit /b %errorlevel%
