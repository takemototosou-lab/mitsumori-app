@echo off
setlocal

set "APP_URL=http://127.0.0.1:4188/estimates/index.html"
set "PDF_API_HEALTH_URL=http://127.0.0.1:4188/api/estimates/pdf/health"
set "LOG_FILE=%~dp0outputs\estimate-launch-server.log"
set "ERR_FILE=%~dp0outputs\estimate-launch-server-error.log"

pushd "%~dp0" >nul 2>nul
if errorlevel 1 (
  echo Failed to move to the launcher folder.
  echo Folder: %~dp0
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo The local server for the estimate app could not be started.
  echo.
  echo Please install Node.js, then double-click this file again.
  echo.
  pause
  exit /b 1
)

call :CHECK_SERVER
if "%SERVER_READY%"=="1" goto OPEN_APP

echo Starting the local server for the estimate app...
if not exist "%~dp0outputs" mkdir "%~dp0outputs"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'node' -ArgumentList 'server.mjs' -WorkingDirectory '%~dp0' -WindowStyle Hidden -RedirectStandardOutput '%LOG_FILE%' -RedirectStandardError '%ERR_FILE%'"
if errorlevel 1 goto SERVER_FAILED

set /a RETRY=0
:WAIT_SERVER
set /a RETRY+=1
call :CHECK_SERVER
if "%SERVER_READY%"=="1" goto OPEN_APP
if %RETRY% GEQ 20 goto SERVER_FAILED
timeout /t 1 /nobreak >nul
goto WAIT_SERVER

:OPEN_APP
echo Opening the estimate app.
echo %APP_URL%
start "" "%APP_URL%"
popd >nul 2>nul
exit /b 0

:SERVER_FAILED
echo The local server for the estimate app could not be started.
echo.
echo Please check:
echo - server.mjs exists in this folder
echo - port 127.0.0.1:4188 is not used by another app
echo - Node.js works correctly
echo.
echo URL:
echo %APP_URL%
echo.
if exist "%LOG_FILE%" (
  echo Server log file:
  echo %LOG_FILE%
  echo.
  echo Server log:
  type "%LOG_FILE%"
  echo.
)
if exist "%ERR_FILE%" (
  echo Server error log file:
  echo %ERR_FILE%
  echo.
  echo Server error log:
  type "%ERR_FILE%"
  echo.
)
pause
exit /b 1

:CHECK_SERVER
set "SERVER_READY=0"
curl.exe --fail --silent --show-error --max-time 2 "%APP_URL%" >nul 2>nul
if errorlevel 1 exit /b 0
curl.exe --fail --silent --show-error --max-time 2 "%PDF_API_HEALTH_URL%" >nul 2>nul
if errorlevel 1 exit /b 0
set "SERVER_READY=1"
exit /b 0
