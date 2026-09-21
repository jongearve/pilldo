@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas instalar Node.js primero: https://nodejs.org
  pause
  exit /b
)
call npm install
call npm run dist
echo.
echo Listo. Tu instalador esta en la carpeta "dist".
start "" "%~dp0dist"
pause
