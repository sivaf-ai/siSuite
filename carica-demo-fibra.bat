@echo off
REM ==============================================================
REM  carica-demo-fibra.bat — carica i dati demo del verticale Fibra.
REM  Da usare DOPO aver avviato l'app (avvia-siSuite.bat).
REM ==============================================================
title siSuite - Carica demo Fibra
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0carica-demo-fibra.ps1"
echo.
echo Premi un tasto per chiudere.
pause >nul
