@echo off
cd /d "%~dp0"
if exist node_modules\vite\bin\vite.js (
  node node_modules\vite\bin\vite.js --host 127.0.0.1 --port 5174
) else if exist ..\chart-editor\node_modules\vite\bin\vite.js (
  node ..\chart-editor\node_modules\vite\bin\vite.js --host 127.0.0.1 --port 5174
) else (
  echo Please run npm install first.
)
pause
