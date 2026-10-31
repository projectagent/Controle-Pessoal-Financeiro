@echo off
chcp 65001 >nul
title Controle Pessoal Financeiro
cd /d "%~dp0"

echo ===================================================
echo        Controle Pessoal Financeiro
echo ===================================================
echo.
echo - Backend SQLite:  http://localhost:3001
echo - Frontend Web:    http://localhost:8080/dashboard
echo.
echo Iniciando servidores e preparando para abrir no navegador...
echo (Mantenha esta janela aberta enquanto estiver usando o sistema)
echo ===================================================
echo.

:: Abre o navegador em segundo plano apos aguardar a subida dos servidores (sem abrir janela sobreposta)
start /b "" cmd /c "ping 127.0.0.1 -n 6 >nul & start http://localhost:8080/dashboard"

:: Executa os servidores (backend + frontend) diretamente nesta janela principal
call npm run dev
