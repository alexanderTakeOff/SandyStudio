@echo off
REM Второе дерево — новая парадигма. App :3001, Inngest :8289.
REM Master в C:\SandyStudio поднимается своим start-stack.cmd на :3000/:8288
REM и этим запуском НЕ гасится (2026-08-06).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-stack.ps1" -Port 3001 -InngestPort 8289 %*
