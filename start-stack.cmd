@echo off
REM Double-click launcher for the SandyStudio local stack (app + durable Inngest).
REM Runs start-stack.ps1 (bypassing execution policy for this one file).
REM   Rebuild the app first:  start-stack.cmd -Build
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-stack.ps1" %*
