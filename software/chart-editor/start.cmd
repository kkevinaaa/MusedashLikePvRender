@echo off
cd /d "%~dp0"
if not exist node_modules\vite\bin\vite.js (
  echo Installing chart editor dependencies...
  call npm.cmd install --cache .npm-cache --no-audit --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm.cmd run dev -- --open
pause
