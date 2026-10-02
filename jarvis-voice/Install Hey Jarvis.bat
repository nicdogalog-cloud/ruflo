@echo off
setlocal
title Install Hey Jarvis
cd /d "%~dp0"
echo.
echo  Installing Hey Jarvis. This takes a few minutes the first time.
echo.

if not exist "%~dp0hey_jarvis.py" (
  echo  Please right-click the zip file, choose "Extract All",
  echo  then double-click "Install Hey Jarvis" inside the extracted folder.
  pause
  exit /b 1
)

set "APPDIR=%LOCALAPPDATA%\HeyJarvis"
set "VPY=%APPDIR%\venv\Scripts\python.exe"
set "VPYW=%APPDIR%\venv\Scripts\pythonw.exe"
set "PYEXE="

rem --- 1. Find Python 3.12 -------------------------------------------------
for /f "delims=" %%i in ('py -3.12 -c "import sys;print(sys.executable)" 2^>nul') do set "PYEXE=%%i"
if not defined PYEXE if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PYEXE if exist "%ProgramFiles%\Python312\python.exe" set "PYEXE=%ProgramFiles%\Python312\python.exe"
if defined PYEXE goto havepython

echo  Python is not installed yet. Installing Python 3.12 now...
winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
  set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
  goto havepython
)
echo.
echo  Python has been installed (or winget is missing).
echo  Please double-click "Install Hey Jarvis" again.
echo  If this keeps happening, install Python 3.12 from python.org first.
pause
exit /b 1

:havepython
echo  Using Python: %PYEXE%

rem --- 2. Stop any running copy so files can be replaced ------------------
call "%~dp0Stop Hey Jarvis.bat" quiet

rem --- 3. Private Python environment + packages ---------------------------
if not exist "%APPDIR%" mkdir "%APPDIR%"
if not exist "%VPY%" "%PYEXE%" -m venv "%APPDIR%\venv"
if not exist "%VPY%" (
  echo  Could not create the Python environment. & pause & exit /b 1
)
echo  Downloading packages...
"%VPY%" -m pip install --disable-pip-version-check -q openwakeword==0.6.0 onnxruntime==1.20.1 sounddevice==0.5.1 numpy==2.1.3 scipy==1.14.1 scikit-learn==1.5.2 pystray==0.19.5 pillow==11.0.0
if errorlevel 1 (
  echo  Package download failed. Check the internet connection and try again.
  pause & exit /b 1
)

rem --- 4. Copy the program and download the voice model -------------------
copy /y "%~dp0hey_jarvis.py" "%APPDIR%\hey_jarvis.py" >nul
echo  Downloading the "Hey Jarvis" voice model...
"%VPY%" -c "import openwakeword.utils as u; u.download_models(model_names=['hey_jarvis']); from openwakeword.model import Model; Model(wakeword_models=['hey_jarvis'], inference_framework='onnx'); print('  Model OK')"
if errorlevel 1 (
  echo  Model download failed. Check the internet connection and try again.
  pause & exit /b 1
)

rem --- 5. Start automatically at login (Startup folder shortcut) ----------
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Hey Jarvis.lnk'); $s.TargetPath=$env:LOCALAPPDATA+'\HeyJarvis\venv\Scripts\pythonw.exe'; $s.Arguments=[char]34+$env:LOCALAPPDATA+'\HeyJarvis\hey_jarvis.py'+[char]34; $s.WorkingDirectory=$env:LOCALAPPDATA+'\HeyJarvis'; $s.Description='Hey Jarvis'; $s.Save()"

rem --- 6. Start it now ------------------------------------------------------
start "" "%VPYW%" "%APPDIR%\hey_jarvis.py"
echo.
echo  Done! Hey Jarvis is running (blue dot near the clock).
echo  Say "Hey Jarvis" and the Jarvis page will open.
echo  It will also start by itself every time you log in.
echo.
pause
