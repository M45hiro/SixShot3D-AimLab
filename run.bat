@echo off
cd /d "%~dp0"

echo Starting AimLab local server...
echo Project path: %cd%

start "" "http://127.0.0.1:8000/index.html"

py -m http.server 8000

pause