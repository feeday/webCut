@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================================
echo webCut 本地启动器
echo ==============================================
echo.
echo 正在启动本地 HTTP 服务：http://127.0.0.1:8080
echo 视频/音频仍然只在本机浏览器处理，不会上传。
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    start "" "http://127.0.0.1:8080"
    py -m http.server 8080 --bind 127.0.0.1
    goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "" "http://127.0.0.1:8080"
    python -m http.server 8080 --bind 127.0.0.1
    goto :eof
)

echo 未找到 Python。
echo 请安装 Python 3，或使用任意本地 HTTP 静态服务器打开本目录。
pause
