@echo off
REM Quick start script for local network multiplayer
REM This script helps you play with friends on your WiFi

echo ╔════════════════════════════════════════════════════════════════╗
echo ║     Survive the Horde - Local Network Multiplayer Setup      ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Get local IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R "IPv4 Address"') do (
    set "LOCAL_IP=%%a"
    goto :got_ip
)

:got_ip
set "LOCAL_IP=%LOCAL_IP:~1%"

echo Your local IP address: %LOCAL_IP%
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║  Make sure the server is running first, then share this URL:  ║
echo ║                                                                ║
echo ║  http://%LOCAL_IP%:3000                                       ║
echo ║                                                                ║
echo ║  Ask friends to open this URL in their browser to join!       ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo Starting server...
npm start
