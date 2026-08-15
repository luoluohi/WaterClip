@echo off
setlocal
set "WATERCLIP_ROOT=%~dp0"
set "HOST=127.0.0.1"
set "PORT=4174"
set "MUSESCORE_PATH=%WATERCLIP_ROOT%third_party\MuseScore 4\bin\MuseScore4.exe"
set "WATERCLIP_STATIC_ROOT=%WATERCLIP_ROOT%app\web"
set "WATERCLIP_PID_FILE=%WATERCLIP_ROOT%runtime\waterclip.pid"
set "WATERCLIP_OPEN_BROWSER=1"
"%WATERCLIP_ROOT%runtime\node.exe" "%WATERCLIP_ROOT%app\server\dist\index.js"
pause
