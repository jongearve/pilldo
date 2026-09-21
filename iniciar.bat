@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas instalar Node.js primero: https://nodejs.org
  pause
  exit /b
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Instalando o reparando, un momento...
  call npm install
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Reintentando la descarga de Electron...
  node node_modules\electron\install.js
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo No se pudo instalar Electron.
  echo Causas posibles: sin internet, o Windows lo bloqueo o lo puso en cuarentena.
  echo Revisa: Seguridad de Windows - Proteccion antivirus - Historial de proteccion.
  pause
  exit /b
)

start "" "%~dp0node_modules\electron\dist\electron.exe" .
