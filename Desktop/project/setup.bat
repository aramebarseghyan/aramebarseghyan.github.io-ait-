@echo off
echo ============================================
echo   Game Hub - Setup Script
echo ============================================
echo.

echo [1/2] Creating folders...
mkdir assets 2>nul && echo   + /assets created || echo   ~ /assets already exists
mkdir css    2>nul && echo   + /css created    || echo   ~ /css already exists
mkdir js     2>nul && echo   + /js created     || echo   ~ /js already exists
echo.

echo [2/2] Moving games to /games...

if exist chess.html (
    move chess.html games\chess.html >nul
    echo   + chess.html      -> games/chess.html
) else (
    echo   ~ chess.html not found (maybe already moved)
)

if exist key-quest.html (
    move key-quest.html games\key-quest.html >nul
    echo   + key-quest.html  -> games/key-quest.html
) else (
    echo   ~ key-quest.html not found (maybe already moved)
)

if exist platformer.html (
    move platformer.html games\platformer.html >nul
    echo   + platformer.html -> games/platformer.html
) else (
    echo   ~ platformer.html not found (maybe already moved)
)

if exist snake.html (
    move snake.html games\snake.html >nul
    echo   + snake.html      -> games/snake.html
) else (
    echo   ~ snake.html not found (maybe already moved)
)

echo.
echo ============================================
echo   Done! Open index.html in your browser.
echo ============================================
pause
