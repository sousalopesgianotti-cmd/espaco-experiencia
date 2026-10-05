@echo off
chcp 65001 > nul
title TOTVS Espaço Experiência • Servidor Local
echo ========================================================
echo   Iniciando TOTVS Espaço Experiência - Guia de Segmentos
echo ========================================================
echo.
echo Abrindo navegador em http://localhost:3000 ...
start http://localhost:3000
echo.
where node >nul 2>nul
if %errorlevel% == 0 (
    echo Executando com Node.js (Alta Performance)...
    node "%~dp0server.js"
) else (
    echo Executando servidor nativo PowerShell...
    powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
)
pause
