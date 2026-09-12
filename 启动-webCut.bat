@echo off
setlocal
cd /d "%~dp0"
title webCut launcher

set "PORT=18080"
set "URL=http://127.0.0.1:%PORT%/"

echo ==============================================
echo webCut local launcher
echo ==============================================
echo.
echo This script only starts Python's built-in HTTP server.
echo No PowerShell, no downloads, no hidden process.
echo.

where py >nul 2>&1
if not errorlevel 1 goto USE_PY

where python >nul 2>&1
if not errorlevel 1 goto USE_PYTHON

echo Python 3 was not found.
echo.
echo Try in Command Prompt:
echo   py -3 --version
echo   python --version
echo.
pause
exit /b 1

:USE_PY
echo Starting webCut at %URL%
start "webCut Server" cmd /k "cd /d ""%~dp0"" ^&^& py -3 -m http.server %PORT% --bind 127.0.0.1"
timeout /t 1 /nobreak >nul
start "" "%URL%"
exit /b 0

:USE_PYTHON
echo Starting webCut at %URL%
start "webCut Server" cmd /k "cd /d ""%~dp0"" ^&^& python -m http.server %PORT% --bind 127.0.0.1"
timeout /t 1 /nobreak >nul
start "" "%URL%"
exit /b 0
