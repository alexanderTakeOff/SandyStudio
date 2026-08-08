@echo off
REM Второе дерево — новая парадигма. App :3001, Inngest :8388.
REM Симметрия start-stack-nx.cmd (2026-08-08): останов уже дерево-scoped по
REM $RepoRoot/$SqliteDir независимо от портов, но health-check в конце должен
REM смотреть на СВОИ порты, не на master'овские 3000/8288.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-stack.ps1" -Port 3001 -InngestPort 8388 %*
