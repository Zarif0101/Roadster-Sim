@echo off
cd /d "%~dp0"
echo Starting Roadster Engineering Lab on http://localhost:8080 (close this window to stop)
start "" http://localhost:8080
where python >nul 2>nul && (python -m http.server 8080 --bind 127.0.0.1) || (node serve.mjs)
