@echo off
REM Second tree - new paradigm. App :3001, Inngest :8388.
REM Master in C:\SandyStudio comes up with its own start-stack.cmd on :3000/:8288
REM and is NOT killed by this launcher (2026-08-06).
REM Comments are ASCII on purpose: cmd reads this file in OEM codepage, and cyrillic
REM REM-lines broke into bogus commands ('ается' is not recognized) - a false alarm
REM that masks real errors (2026-08-09).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-stack.ps1" -Port 3001 -InngestPort 8388 %*
