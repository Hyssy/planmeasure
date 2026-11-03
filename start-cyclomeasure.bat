@echo off
rem Double-click to update CycloMeasure to the latest version on GitHub and run it on this computer.
cd /d "%~dp0"
echo Getting the latest version from GitHub...
git pull
if errorlevel 1 (
  echo.
  echo Could not update. If you changed files in this folder, tell Claude what the message above says.
  pause
  exit /b 1
)
echo Installing anything new...
call npm install --no-audit --no-fund
echo Starting CycloMeasure. Leave this window open while you use it; close it to stop.
call npm run dev -- --open
pause
