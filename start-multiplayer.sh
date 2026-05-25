#!/bin/bash
# Quick start script for local network multiplayer
# This script helps you play with friends on your WiFi

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Survive the Horde - Local Network Multiplayer Setup      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Get local IP (macOS and Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    LOCAL_IP=$(ipconfig getifaddr en0)
else
    # Linux
    LOCAL_IP=$(hostname -I | awk '{print $1}')
fi

echo "Your local IP address: $LOCAL_IP"
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Make sure the server is running first, then share this URL:  ║"
echo "║                                                                ║"
echo "║  http://$LOCAL_IP:3000                                        ║"
echo "║                                                                ║"
echo "║  Ask friends to open this URL in their browser to join!       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Starting server..."
npm start
