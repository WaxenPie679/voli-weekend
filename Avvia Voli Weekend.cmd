@echo off
rem Avvia Voli Weekend su http://127.0.0.1:5190 (SMOT resta sulla 5180)
cd /d "%~dp0"
start "Voli Weekend server" /min node scripts\serve.js
timeout /t 1 /nobreak >nul
start "" http://127.0.0.1:5190
