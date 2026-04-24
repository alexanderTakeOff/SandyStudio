@echo off
cd /d C:\SandyStudio
git add -A
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "auto-sync %date% %time%"
    git push origin master
)
