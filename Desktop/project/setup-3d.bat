@echo off
echo Installing Driving Simulator dependencies (Three.js + cannon-es)...
cd /d "%~dp0games\photoreal-3d"
call npm install
echo.
echo Done! To launch dev server:
echo   cd games\photoreal-3d
echo   npm run dev
echo.
echo Then open http://localhost:5173 in the browser.
pause
