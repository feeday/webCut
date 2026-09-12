@echo off
setlocal EnableExtensions
title webCut Server
cd /d "%~dp0"

set "SCRIPT=%~dp0server.py"
set "PORT=18080"
set "ERR=0"

echo ==============================================
echo webCut Windows launcher
echo ==============================================
echo Folder : %~dp0
echo.

if not exist "%SCRIPT%" (
    echo [ERROR] Cannot find server.py
    echo Expected: %SCRIPT%
    echo.
    pause
    exit /b 1
)

set "PYCMD="
where py >nul 2>&1
if not errorlevel 1 set "PYCMD=py -3"

if not defined PYCMD (
    where python >nul 2>&1
    if not errorlevel 1 set "PYCMD=python"
)

if not defined PYCMD (
    echo [ERROR] Python 3 was not found.
    echo.
    echo Install Python 3 and enable Add Python to PATH.
    echo Then run this BAT again.
    echo.
    pause
    exit /b 1
)

echo Python : %PYCMD%
echo Start  : http://127.0.0.1:%PORT%/
echo.
echo If port %PORT% is busy, webCut will try ports %PORT%-18090 automatically.
echo Keep this window open while using webCut.
echo.

%PYCMD% "%SCRIPT%" --host 127.0.0.1 --port %PORT% --auto-port
set "ERR=%ERRORLEVEL%"

echo.
echo ==============================================
if "%ERR%"=="0" (
    echo webCut server stopped normally.
) else (
    echo [ERROR] webCut failed to start or exited.
    echo Exit code: %ERR%
)
echo ==============================================
echo.
echo This window will stay open so the error can be read.
pause
exit /b %ERR%
