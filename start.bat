@echo off
title LIQUID+ - Serveur
echo.
echo  LIQUID+ - Demarrage du serveur...
echo.

:: Port forwarding pour emulateur Android (silencieux si adb absent)
set ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe
if exist "%ADB%" (
  "%ADB%" reverse tcp:3000 tcp:3000 >nul 2>&1
  echo  [OK] adb reverse tcp:3000 tcp:3000
) else (
  echo  [--] adb non trouve, port forwarding ignore
)

echo  Ouvre http://localhost:3000 dans ton navigateur
echo.
node server.js
pause
