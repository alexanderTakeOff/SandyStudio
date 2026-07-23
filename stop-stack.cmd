@echo off
REM Double-click EMERGENCY STOP for the SandyStudio local stack (app + Inngest).
REM Use when the pipeline goes into churn (self-firing job storm).
REM Runs stop-stack.ps1 (bypassing execution policy for this one file).
REM   Hard reset (park durable Inngest DB so the storm can't resume):  stop-stack.cmd -Wipe
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-stack.ps1" %*
