@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  npm install
)
echo.
echo Starting Karel Terra CMS...
echo Open http://localhost:3000 in your browser
echo.
node server.js
echo.
echo Server stopped. See any errors above.
pause
