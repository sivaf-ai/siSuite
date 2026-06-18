@echo off
REM ==============================================================
REM  ferma-siSuite.bat — doppio click per fermare l'app.
REM  I dati restano salvati nei volumi Docker.
REM ==============================================================
title siSuite - Stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ferma-siSuite.ps1"
echo.
echo Premi un tasto per chiudere.
pause >nul
