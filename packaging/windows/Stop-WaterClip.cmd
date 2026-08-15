@echo off
setlocal
set "WATERCLIP_PID=%~dp0runtime\waterclip.pid"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=$env:WATERCLIP_PID; if (!(Test-Path -LiteralPath $f)) { Write-Host 'WaterClip 未在运行。'; exit 0 }; $raw=(Get-Content -LiteralPath $f -Raw).Trim(); if ($raw -notmatch '^\d+$') { Write-Error 'PID 文件无效。'; exit 1 }; $p=Get-Process -Id ([int]$raw) -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.Id -Force; Write-Host 'WaterClip 已停止。' } else { Write-Host 'WaterClip 未在运行。' }; Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue"
pause
