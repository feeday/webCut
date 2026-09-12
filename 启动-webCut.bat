@echo off
setlocal EnableExtensions
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
    py -3 -c "import http.server" >nul 2>&1
    if not errorlevel 1 set "PYCMD=py -3"
)

if not defined PYCMD (
    where python >nul 2>&1
    if not errorlevel 1 (
        python -c "import http.server" >nul 2>&1
        if not errorlevel 1 set "PYCMD=python"
    )
)

if not defined PYCMD (
    where python3 >nul 2>&1
    if not errorlevel 1 (
        python3 -c "import http.server" >nul 2>&1
        if not errorlevel 1 set "PYCMD=python3"
    )
)

if not defined PYCMD goto NO_PYTHON

rem Use a high fixed localhost port. The previous automatic port probe was unreliable in .bat.
set "PORT=18080"
set "URL=http://127.0.0.1:%PORT%/"

echo Python : %PYCMD%
echo Address: %URL%
echo.
echo Keep this window open while using webCut.
echo Video/audio files are processed locally in your browser.
echo Closing this window stops only the local static page server.
echo.

rem Open the browser after the Python server has had a moment to start.
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1200; Start-Process '%URL%'"

%PYCMD% -m http.server %PORT% --bind 127.0.0.1
set "ERR=%ERRORLEVEL%"

echo.
echo ==============================================
echo webCut server stopped. Error code: %ERR%
echo ==============================================
echo.
if "%ERR%"=="1" echo Port %PORT% may already be in use. Close the program using it, or edit PORT in this BAT file.
echo Copy the error message above if you need help.
echo.
pause
exit /b %ERR%

:NO_PYTHON
cls
echo ==============================================
echo webCut could not start
echo ==============================================
echo.
echo Python 3 was not found or could not run.
echo.
echo Try this in Command Prompt:
echo     python --version
echo or:
echo     py -3 --version
echo.
echo If both fail, install Python 3 and enable Add Python to PATH.
echo.
pause
exit /b 1
