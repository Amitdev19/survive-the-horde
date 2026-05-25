@echo off
REM Windows version of pre-deployment checklist

setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║     Survive the Horde - Pre-Deployment Checklist              ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

set passed=0
set failed=0

REM Core Files Check
echo [1/7] Checking core files...

if exist server.js (
  echo ✓ server.js exists
  set /a passed+=1
) else (
  echo ✗ server.js missing
  set /a failed+=1
)

if exist "client\src\main.js" (
  echo ✓ client/src/main.js exists
  set /a passed+=1
) else (
  echo ✗ client/src/main.js missing
  set /a failed+=1
)

if exist package.json (
  echo ✓ package.json exists
  set /a passed+=1
) else (
  echo ✗ package.json missing
  set /a failed+=1
)

if exist client (
  echo ✓ client/ directory exists
  set /a passed+=1
) else (
  echo ✗ client/ directory missing
  set /a failed+=1
)

echo.

REM Dependencies Check
echo [2/7] Checking dependencies...

where node >nul 2>nul
if !errorlevel! equ 0 (
  for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
  echo ✓ Node.js installed (!NODE_VERSION!)
  set /a passed+=1
) else (
  echo ✗ Node.js not installed
  set /a failed+=1
  goto :end
)

where npm >nul 2>nul
if !errorlevel! equ 0 (
  for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
  echo ✓ npm installed (!NPM_VERSION!)
  set /a passed+=1
) else (
  echo ✗ npm not installed
  set /a failed+=1
  goto :end
)

if exist node_modules (
  echo ✓ Dependencies installed (node_modules exists)
  set /a passed+=1
) else (
  echo ⚠ node_modules not found - run 'npm install'
)

findstr /M "\"ws\"" package.json >nul 2>nul
if !errorlevel! equ 0 (
  echo ✓ WebSocket (ws) dependency in package.json
  set /a passed+=1
) else (
  echo ✗ WebSocket (ws) dependency missing
  set /a failed+=1
)

echo.

REM Client Build Check
echo [3/7] Checking client build...

if exist "client\dist" (
  echo ✓ Client built (dist/ exists)
  set /a passed+=1
  
  if exist "client\dist\index.html" (
    echo ✓ index.html generated
    set /a passed+=1
  ) else (
    echo ✗ index.html not found in dist/
    set /a failed+=1
  )
) else (
  echo ⚠ Client not built yet - run 'npm run build'
)

echo.

REM Configuration Files
echo [4/7] Checking configuration files...

if exist "QUICK_DEPLOY.md" (
  echo ✓ QUICK_DEPLOY.md exists
  set /a passed+=1
) else (
  echo ✗ QUICK_DEPLOY.md missing
  set /a failed+=1
)

if exist "MULTIPLAYER_SUMMARY.md" (
  echo ✓ MULTIPLAYER_SUMMARY.md exists
  set /a passed+=1
) else (
  echo ✗ MULTIPLAYER_SUMMARY.md missing
  set /a failed+=1
)

if exist Dockerfile (
  echo ✓ Dockerfile exists
  set /a passed+=1
) else (
  echo ✗ Dockerfile missing
  set /a failed+=1
)

echo.

REM Server Code Check
echo [5/7] Checking server configuration...

findstr /M "GameRoom" server.js >nul 2>nul
if !errorlevel! equ 0 (
  echo ✓ GameRoom class defined
  set /a passed+=1
) else (
  echo ✗ GameRoom class not found
  set /a failed+=1
)

findstr /M "WebSocket.Server" server.js >nul 2>nul
if !errorlevel! equ 0 (
  echo ✓ WebSocket server handler found
  set /a passed+=1
) else (
  echo ✗ WebSocket handler not found
  set /a failed+=1
)

findstr /M "setInterval" server.js >nul 2>nul
if !errorlevel! equ 0 (
  echo ✓ Game loop timer found
  set /a passed+=1
) else (
  echo ✗ Game loop timer not found
  set /a failed+=1
)

echo.

REM Get Local IP
echo [6/7] Getting network information...

for /f "tokens=2 delims=: " %%a in ('ipconfig ^| findstr /R "IPv4 Address"') do (
  set "LOCAL_IP=%%a"
  goto :got_ip
)

:got_ip
if defined LOCAL_IP (
  echo ✓ Local IP: !LOCAL_IP!
  set /a passed+=1
) else (
  echo ⚠ Could not detect local IP
)

echo.

REM Summary
echo.
echo ╔════════════════════════════════════════════════════════════════╗
if !failed! equ 0 (
  echo ║  ✓ All checks passed! Ready to deploy.
) else (
  echo ║  ✗ Some checks failed. See above for details.
)
echo ║  Passed: !passed! ^| Failed: !failed!
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Next Steps
echo Next Steps:
echo.
if !failed! equ 0 (
  echo 1. Test locally:
  echo    npm start
  echo.
  echo 2. Open multiple browser tabs:
  echo    http://localhost:3000
  echo.
  echo 3. Test local network (share with friends):
  echo    run start-multiplayer.bat
  echo    Share: http://!LOCAL_IP!:3000
  echo.
  echo 4. Deploy to cloud:
  echo    See QUICK_DEPLOY.md for options
) else (
  echo Please fix the failed checks above, then run this script again.
)

echo.

:end
endlocal
