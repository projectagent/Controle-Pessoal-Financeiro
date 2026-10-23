@echo off
chcp 65001 >nul
title Controle Pessoal Financeiro
cd /d "%~dp0"

echo ===================================================
echo     Iniciando o Controle Pessoal Financeiro...
echo ===================================================
echo.
echo - Backend SQLite:  http://localhost:3001
echo - Frontend Web:    http://localhost:8080/dashboard
echo.
echo Iniciando servidores e abrindo no navegador...
echo.

start "Controle Pessoal Financeiro - Servidores" cmd /k "npm run dev"

ping 127.0.0.1 -n 6 >nul
start "" "http://localhost:8080/dashboard"

echo.
echo Servicos iniciados com sucesso!
echo Nao feche a janela do terminal enquanto estiver usando o sistema.
ping 127.0.0.1 -n 4 >nul
exit
