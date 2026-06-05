@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\run-dealernet-pricing.ps1" -Profile daily -IncludeReview
exit /b %errorlevel%
