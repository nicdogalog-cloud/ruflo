@echo off
rem Stops Hey Jarvis if it is running.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*' -and $_.CommandLine -like '*hey_jarvis.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
if /i "%~1"=="quiet" exit /b 0
echo.
echo  Hey Jarvis has been stopped. It will start again next time you log in.
echo  (To remove it completely, use "Uninstall Hey Jarvis".)
echo.
pause
