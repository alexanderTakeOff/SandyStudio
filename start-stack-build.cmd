@echo off
REM Double-click launcher — REBUILD then start the SandyStudio local stack.
REM Use this AFTER pulling code changes (git pull). It cleans .next, rebuilds the
REM app, then starts app (:3000) + durable Inngest (:8288).
REM For a plain start with no rebuild, use start-stack.cmd instead.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-stack.ps1" -Build %*
