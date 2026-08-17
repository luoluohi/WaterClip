@echo off
setlocal EnableExtensions
set "WATERCLIP_PID=%~dp0runtime\waterclip.pid"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$f=$env:WATERCLIP_PID; if (!(Test-Path -LiteralPath $f)) { Write-Host 'WaterClip is not running.'; exit 0 }; $raw=(Get-Content -LiteralPath $f -Raw).Trim(); if ($raw -notmatch '^\d+$') { Write-Error 'Invalid PID file.'; exit 1 }; $p=Get-Process -Id ([int]$raw) -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.Id -Force; Write-Host 'WaterClip stopped.' } else { Write-Host 'WaterClip is not running.' }; Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue"
pause
