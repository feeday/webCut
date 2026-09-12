@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title webCut Local Server

cls
echo ==============================================
echo webCut local launcher
echo ==============================================
echo.

set "PYCMD="

where py >nul 2>&1
if not errorlevel 1 (
    py -3 -c "import sys,http.server" >nul 2>&1
    if not errorlevel 1 set "PYCMD=py -3"
)

if not defined PYCMD (
    where python >nul 2>&1
    if not errorlevel 1 (
        python -c "import sys,http.server" >nul 2>&1
        if not errorlevel 1 set "PYCMD=python"
    )
)

if not defined PYCMD (
    where python3 >nul 2>&1
    if not errorlevel 1 (
        python3 -c "import sys,http.server" >nul 2>&1
        if not errorlevel 1 set "PYCMD=python3"
    )
)

if not defined PYCMD goto :NO_PYTHON

set "PORT="
for /L %%P in (8080,1,8090) do (
    if not defined PORT (
        %PYCMD% -c "import socket,sys; s=socket.socket(); r=s.connect_ex(('127.0.0.1',%%P)); s.close(); sys.exit(0 if r!=0 else 1)" >nul 2>&1
        if not errorlevel 1 set "PORT=%%P"
    )
)

if not defined PORT goto :NO_PORT

set "URL=http://127.0.0.1:%PORT%/"
echo Python : %PYCMD%
echo Address: %URL%
echo.
echo Keep this window open while using webCut.
echo Video/audio files are still processed locally in your browser.
echo Closing this window stops only the local page server.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1200; Start-Process '%URL%'"

%PYCMD% -m http.server %PORT% --bind 127.0.0.1
set "ERR=%ERRORLEVEL%"

echo.
echo ==============================================
echo webCut server stopped. Error code: %ERR%
echo ==============================================
echo.
echo If this was unexpected, copy the message above and send it to me.
pause
exit /b %ERR%

:NO_PYTHON
cls
echo ==============================================
echo webCut could not start
necho ==============================================
echo.
echo Python 3 was not found or could not run.
echo.
echo Try this in Command Prompt:
echo     python --version
echo or:
echo     py -3 --version
echo.
echo If both fail, install Python 3 and enable "Add Python to PATH".
echo.
pause
exit /b 1

:NO_PORT
cls
echo ==============================================
echo webCut could not start
necho ==============================================
echo.
echo Ports 8080 through 8090 are already in use.
echo Close another local web server and try again.
echo.
pause
exit /b 2
