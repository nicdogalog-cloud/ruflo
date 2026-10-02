@echo off
title Uninstall Hey Jarvis
call "%~dp0Stop Hey Jarvis.bat" quiet
powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath ([Environment]::GetFolderPath('Startup')+'\Hey Jarvis.lnk') -Force -ErrorAction SilentlyContinue"
timeout /t 2 /nobreak >nul
if exist "%LOCALAPPDATA%\HeyJarvis" rmdir /s /q "%LOCALAPPDATA%\HeyJarvis"
echo.
echo  Hey Jarvis has been removed. It will no longer start at login.
echo.
pause
