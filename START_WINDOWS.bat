@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Установи Node.js 20+ с https://nodejs.org/ и запусти файл снова.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Устанавливаю зависимости...
  call npm install
  if errorlevel 1 (
    echo Не удалось установить зависимости. Проверь интернет.
    pause
    exit /b 1
  )
)
start "AGROBULL" http://localhost:3000
call npm start
pause
