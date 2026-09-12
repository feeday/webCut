@echo off
setlocal EnableExtensions
title webCut Server

set "SCRIPT=%~dp0server.py"

echo ==============================================
echo webCut local launcher
echo ==============================================
echo.

if not exist "%SCRIPT%" (
    echo Cannot find server.py next to this BAT file.
    echo Expected: %SCRIPT%
    echo.
    pause
    exit /b 1
)

where py >nul 2>&1
if not errorlevel 1 (
    echo Starting with: py -3 server.py
    echo.
    py -3 "%SCRIPT%"
    set "ERR=%ERRORLEVEL%"
    goto END
)

where python >nul 2>&1
if not errorlevel 1 (
    echo Starting with: python server.py
    echo.
    python "%SCRIPT%"
    set "ERR=%ERRORLEVEL%"
    goto END
)

echo Python 3 was not found.
echo.
echo Try:
echo   py -3 --version
echo   python --version
echo.
pause
exit /b 1

:END
if not "%ERR%"=="0" (
    echo.
    echo server.py exited with error code %ERR%.
    pause
)
exit /b %ERR%
