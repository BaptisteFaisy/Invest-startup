@echo off
title LIQUID+ - App Desktop (Electron)
echo.
echo  LIQUID+ - Demarrage de l'application desktop...
echo.
cd /d "%~dp0"
call npm run electron
pause
