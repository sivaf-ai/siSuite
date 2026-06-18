@echo off
REM ==============================================================
REM  avvia-siSuite.bat — doppio click per avviare tutta l'app.
REM  Richiede solo Docker Desktop installato. Fa tutto il resto.
REM ==============================================================
title siSuite - Avvio
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0avvia-siSuite.ps1"
echo.
echo Premi un tasto per chiudere questa finestra (l'app resta in esecuzione).
pause >nul
