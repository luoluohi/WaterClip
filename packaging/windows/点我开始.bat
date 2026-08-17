@echo off
setlocal EnableExtensions

set "WATERCLIP_ROOT=%~dp0"
set "WATERCLIP_URL=http://127.0.0.1:4174"
set "WATERCLIP_LOG=%WATERCLIP_ROOT%runtime\waterclip.log"

if not exist "%WATERCLIP_ROOT%runtime\node.exe" goto :missing_files
if not exist "%WATERCLIP_ROOT%app\server\dist\index.js" goto :missing_files

powershell.exe -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%WATERCLIP_URL%/api/health'; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  start "" "%WATERCLIP_URL%"
  exit /b 0
)

echo 正在准备 WaterClip，请稍候...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%WATERCLIP_ROOT%Prepare-MuseScore.ps1" -BundleRoot "%WATERCLIP_ROOT%"
if errorlevel 1 goto :prepare_failed

set "HOST=127.0.0.1"
set "PORT=4174"
set "MUSESCORE_PATH=%LOCALAPPDATA%\WaterClip\runtime\musescore-4.7.4\bin\MuseScore4.exe"
set "WATERCLIP_STATIC_ROOT=%WATERCLIP_ROOT%app\web"
set "WATERCLIP_PID_FILE=%WATERCLIP_ROOT%runtime\waterclip.pid"
set "WATERCLIP_OPEN_BROWSER=0"
if not exist "%WATERCLIP_ROOT%runtime" mkdir "%WATERCLIP_ROOT%runtime"

start "WaterClip" /b "%WATERCLIP_ROOT%runtime\node.exe" "%WATERCLIP_ROOT%app\server\dist\index.js" >>"%WATERCLIP_LOG%" 2>&1
if errorlevel 1 goto :server_failed

for /l %%N in (1,1,30) do (
  powershell.exe -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%WATERCLIP_URL%/api/health'; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
  if not errorlevel 1 (
    start "" "%WATERCLIP_URL%"
    exit /b 0
  )
  >nul timeout /t 1 /nobreak
)

:server_failed
echo WaterClip 启动失败。日志："%WATERCLIP_LOG%"
start "" notepad.exe "%WATERCLIP_LOG%"
pause
exit /b 1

:prepare_failed
echo MuseScore 运行环境准备失败。
pause
exit /b 1

:missing_files
echo 便携包文件不完整，请重新完整解压 ZIP。
pause
exit /b 1
