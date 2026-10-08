@echo off
cd /d "%~dp0"
if not exist node_modules\mediabunny (
  echo Please run npm install first.
  pause
  exit /b 1
)
node node_modules\vite\bin\vite.js --host 127.0.0.1 --port 5175
pause
