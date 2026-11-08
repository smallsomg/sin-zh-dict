@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  僧中词典 · TXT 底本转换为 JS 数据分片
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_data.ps1"
echo.
pause
