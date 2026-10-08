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
powershell -NoProfile -Command "try { $r = Invoke-WebRequest 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2; if ($r.Content -match '<title>Contour') { Start-Process 'http://127.0.0.1:5173/'; exit 10 }; exit 11 } catch { exit 0 }"
if errorlevel 11 (
  echo Port 5173 is occupied by another application. Stop it before starting the editor.
  pause
  exit /b 1
)
if errorlevel 10 exit /b 0
call npm.cmd run dev -- --open
pause
