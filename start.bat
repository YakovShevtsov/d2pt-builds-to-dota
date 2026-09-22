@echo off
title D2PT - Dota 2
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install it from https://nodejs.org ^(version 22 or newer^) and run again.
  pause
  exit /b 1
)
node server.js
if errorlevel 1 pause
