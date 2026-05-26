@echo off
cd /d "%~dp0.."
"C:\Program Files\nodejs\node.exe" scripts\migrate-project-detail-page.cjs
exit /b %ERRORLEVEL%
