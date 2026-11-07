@echo off
title QueryTrends Social Autopilot
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed yet. Opening nodejs.org - install the LTS version, then double-click this file again.
  start https://nodejs.org
  pause
  exit /b
)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
