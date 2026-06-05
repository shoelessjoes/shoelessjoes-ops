@echo off
setlocal
cd /d "%~dp0..\..\.."
call npm run job:poll-messages
exit /b %errorlevel%
