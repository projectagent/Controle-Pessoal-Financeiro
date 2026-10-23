@echo off
cd /d "%~dp0"
echo Iniciando o Controle Financeiro...
start "Controle Financeiro - Vite" cmd /k "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"
timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"
