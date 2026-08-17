@echo off
setlocal
set "WATERCLIP_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%WATERCLIP_ROOT%Prepare-MuseScore.ps1" -BundleRoot "%WATERCLIP_ROOT%."
if errorlevel 1 goto :prepare_failed
set "HOST=127.0.0.1"
set "PORT=4174"
set "MUSESCORE_PATH=%LOCALAPPDATA%\WaterClip\runtime\musescore-4.7.4\bin\MuseScore4.exe"
set "WATERCLIP_STATIC_ROOT=%WATERCLIP_ROOT%app\web"
set "WATERCLIP_PID_FILE=%WATERCLIP_ROOT%runtime\waterclip.pid"
set "WATERCLIP_OPEN_BROWSER=1"
"%WATERCLIP_ROOT%runtime\node.exe" "%WATERCLIP_ROOT%app\server\dist\index.js"
pause
exit /b %errorlevel%

:prepare_failed
echo Failed to prepare the bundled MuseScore runtime.
pause
exit /b 1
