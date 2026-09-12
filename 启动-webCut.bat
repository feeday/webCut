@echo off
setlocal EnableExtensions
title webCut Server

set "SCRIPT=%~dp0server.py"
set "PORT=18080"

echo ==============================================
echo webCut Windows launcher
echo ==============================================
echo.

if not exist "%SCRIPT%" (
    echo Cannot find server.py next to this BAT file.
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
    echo Python 3 was not found.
    echo Install Python 3, then try again.
    echo.
    pause
    exit /b 1
)

echo Python : %PYCMD%
echo Address: http://127.0.0.1:%PORT%/
echo.
echo Keep this window open while using webCut.
echo.

%PYCMD% "%SCRIPT%" --host 127.0.0.1 --port %PORT%
set "ERR=%ERRORLEVEL%"

if not "%ERR%"=="0" (
    echo.
    echo server.py exited with error code %ERR%.
    pause
)

exit /b %ERR%
