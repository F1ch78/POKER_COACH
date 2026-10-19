@echo off
rem Starts the content studio with its local bridge (see server.ps1).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 pause
