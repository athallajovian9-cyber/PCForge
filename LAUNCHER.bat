@echo off
REM ==========================================================
REM  PCFORGE - build a PC, then find the wall it hits.
REM  No install, no setup.
REM ==========================================================
setlocal
cd /d "%~dp0"

if exist "launcher.py" (
	start "" "%~dp0launcher.py"
	exit /b 0
)

echo   launcher.py is not next to this launcher.
echo   Either run PCForge.exe, or open PCForge.html directly:
echo     "%~dp0PCForge.html"
echo.
pause
exit /b 1
