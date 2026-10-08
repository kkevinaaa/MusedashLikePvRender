@echo off
cd /d "%~dp0"
node ..\chart-editor\node_modules\vite\bin\vite.js --host 127.0.0.1 --port 5175
pause
