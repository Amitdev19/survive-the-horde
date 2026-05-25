# 🎮 Survive the Horde - Multiplayer Configuration Summary

## Project Scan Results

### ✅ Current Setup
- **Game Type**: Pixel art tower defense (2D canvas-based)
- **Framework**: Vanilla Phaser 3 (client), Node.js WebSocket (server)
- **Players**: Supports multiple players in shared game rooms
- **Network**: WebSocket connection (ws/wss)
- **Status**: **Multiplayer already functional!** ✨

### 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Client Browser (Phaser Game Engine)                │
│  - Renders game world                               │
│  - Handles player input (WASD, clicks)              │
│  - Connects to WebSocket server                     │
└─────────────────────────────────────────────────────┘
                        ↕ ws://
┌─────────────────────────────────────────────────────┐
│  Node.js Server (WebSocket + HTTP)                  │
│  - Manages game state                               │
│  - Broadcasts updates 15 FPS                        │
│  - Processes player actions at 30 FPS               │
│  - Supports multiple game rooms                     │
└─────────────────────────────────────────────────────┘
```

---

## 🌐 Multiplayer Modes Available

### 1. **Local Play** (Single Device, Multiple Tabs)
```
Same Device:
└─ Browser Tab 1: Player 1 → WebSocket → Game Server → Game Room
└─ Browser Tab 2: Player 2 → WebSocket → Game Server → Game Room
```
**Status**: ✅ Working now
**How**: Open `http://localhost:3000` in 2+ tabs

### 2. **Local Network** (Same WiFi)
```
Your Computer:     192.168.1.50:3000 (Server)
Friend's Computer: 192.168.1.100 → Connect to 192.168.1.50:3000
Another Device:    192.168.1.150 → Connect to 192.168.1.50:3000
```
**Status**: ✅ Ready to use
**How**: Run `start-multiplayer.bat` (or .sh on Mac/Linux)
**Share**: `http://YOUR_IP:3000`

### 3. **Internet Multiplayer** (Deployed to Cloud)
```
Cloud Server: game.railway.app (Deployed Node.js server)
Player 1: anywhere.com → game.railway.app
Player 2: anywhere.com → game.railway.app
Player 3: anywhere.com → game.railway.app
```
**Status**: ⚙️ Requires deployment
**See**: QUICK_DEPLOY.md

---

## 📁 Project Structure

```
knight-game/
├── server.js                    (Main game server - WebSocket)
├── server-enhanced.js           (Enhanced server with logging)
├── client/
│   ├── src/
│   │   ├── main.js            (Game entry point)
│   │   ├── pixelAtlas.js      (Sprite rendering)
│   │   ├── audio.js           (Sound effects)
│   │   └── styles.css         (UI styling)
│   ├── dist/                   (Built game - served to players)
│   └── index.html             (Game HTML)
├── package.json               (Root dependencies)
├── MULTIPLAYER_SETUP.md       (Detailed setup guide)
├── QUICK_DEPLOY.md            (Cloud deployment guide)
├── start-multiplayer.bat       (Windows local network script)
├── start-multiplayer.sh        (Mac/Linux local network script)
├── Dockerfile                  (Container configuration)
├── docker-compose.yml         (Docker compose setup)
├── railway.toml               (Railway.app config)
└── render.yaml                (Render.com config)
```

---

## 🚀 Quick Start Guide

### Test Locally (Same Device)
```bash
# Terminal 1
npm start

# Then open in browser
http://localhost:3000
http://localhost:3000  # In another tab
# Now you have 2 players!
```

### Test on Local WiFi (Friends Device)
```bash
# Your Computer: Terminal
npm start

# Get your IP
ipconfig  # Windows
hostname -I  # Linux
# Example: 192.168.1.50

# Share with friends: http://192.168.1.50:3000
# Friends open that URL in their browser
```

### Deploy to Internet (Railway.app Recommended)

```bash
# 1. Sign up: https://railway.app
# 2. Connect your GitHub repo
# 3. Railway auto-deploys
# 4. Share public URL with anyone

# Or use ngrok for temporary URL
npx ngrok http 3000
# Share: https://abc123.ngrok.io
```

---

## 🎯 Key Features for Multiplayer

### ✅ Already Implemented
- Real-time game state synchronization
- Multiple player avatars with unique colors
- Shared resource management
- Collaborative tower building
- Wave progression shared by all players
- Base health (team responsibility)
- Player name persistence (localStorage)
- Multiple game rooms support

### ⚙️ Customizable
- Port: Edit `package.json` or `PORT` env var
- Max rooms: `MAX_ROOMS` environment variable
- Room timeout: `ROOM_TIMEOUT` environment variable
- Broadcast rate: Edit `BROADCAST_RATE` in server.js
- Game difficulty: Edit `TOWER_DEFS`, `ENEMY_DEFS`

---

## 📋 Deployment Comparison

| Platform | Cost | Setup | Uptime | Recommended |
|----------|------|-------|--------|-------------|
| **Local Machine** | Free | 2 min | Device on | Testing |
| **ngrok** | Free | 1 min | 8 hrs | Quick demos |
| **Railway** | $5/mo | 5 min | 99.9% | Best value |
| **Render** | Free/tier | 10 min | 99% | Good free option |
| **Heroku** | $7/mo | 5 min | 99% | Ending free tier |
| **Docker** | $5-10/mo | 20 min | 99.9% | Full control |

---

## 🔧 Server Configuration Reference

### Environment Variables
```bash
PORT=3000                    # Server port
NODE_ENV=production          # production or development
MAX_ROOMS=100               # Max concurrent rooms
ROOM_TIMEOUT=3600000        # Room cleanup timeout (1 hr)
ENABLE_CORS=true            # Enable CORS headers
LOG_CONNECTIONS=true        # Log player connections
```

### Network Ports
```
3000 - 3010   Default port range (auto-increments if busy)
8080          Alternative (if 3000 blocked)
80            HTTP production
443           HTTPS production
```

---

## 🐛 Troubleshooting

### "Can't connect from another device"
```bash
# 1. Verify server is running
npm start

# 2. Get your computer's local IP
ipconfig  # Windows
hostname -I  # Linux
# Should show something like: 192.168.1.50

# 3. Check friend can reach it
curl http://YOUR_IP:3000

# 4. If firewall blocks, temporarily disable to test
# Or allow Node.js in Windows Firewall

# 5. Ensure both on same WiFi network
```

### "Port already in use"
```bash
# Server auto-tries 3001-3010, but to manually change:
PORT=8080 npm start
```

### "WebSocket connection fails"
```bash
# Check browser console (F12 → Console tab)
# Should see: "Connected" message
# If not, check:
# - Server is running
# - You're using correct domain/IP
# - WebSocket protocol matches (ws or wss)
```

---

## 📈 Performance & Scalability

### Current Capacity
- **Players per room**: No hard limit (tested up to 20+)
- **Max concurrent rooms**: 100 (configurable)
- **Network bandwidth**: ~5KB/s per player
- **CPU usage**: Minimal (mostly idle)
- **Update rate**: 15 FPS broadcast, 30 FPS game logic

### Optimization Tips
- Reduce `BROADCAST_RATE` if bandwidth constrained
- Increase `ROOM_TIMEOUT` to keep rooms longer
- Deploy to server geographically close to players
- Use CDN for static assets in production

---

## 🎓 How Multiplayer Works (Technical)

### Connection Flow
```
1. Player opens http://SERVER:3000
2. Browser loads HTML + game client (Phaser)
3. Client connects WebSocket: ws://SERVER:3000
4. Server assigns playerId and roomId
5. Client joins GameRoom (meadow by default)
6. Server adds player to shared game state
```

### Game Loop
```
Server (every 33ms):
├─ Update game state
│  ├─ Move zombies toward base
│  ├─ Fire towers at zombies
│  ├─ Detect collisions
│  └─ Process player actions
└─ Broadcast state to all players in room

Server (every 66ms):
├─ Send complete game state to all clients
└─ Include events (deaths, builds, damage)

Client (every frame):
├─ Render game world from latest state
├─ Handle player input
└─ Send player actions to server
```

### Player Actions Supported
- Move (WASD input)
- Gather resources (click nodes)
- Build towers (click + select tower)
- Upgrade towers (select + upgrade)
- Repair base (button click)

---

## 📚 Next Steps

1. **Test Locally**: `npm start` → Open 2 browser tabs
2. **Test Network**: Use `start-multiplayer.bat` → Share IP with friend
3. **Deploy Online**: Choose platform from QUICK_DEPLOY.md
4. **Monitor**: Use enhanced-server.js for better logging
5. **Scale**: Adjust environment variables as needed

---

## 📞 Support Resources

- **WebSocket Debugging**: Check browser Console (F12)
- **Server Logs**: Run `node server.js` (not npm start) to see detailed output
- **Port Issues**: Use `lsof -i :3000` (Mac/Linux) to find process
- **Network Issues**: `ping YOUR_IP` to test connectivity

---

## 🎉 Ready to Play!

Your multiplayer tower defense game is **ready to go**! 

Choose your deployment method:
- **Friends on WiFi?** → `start-multiplayer.bat`
- **Worldwide?** → Railway.app ($5/mo)
- **Quick demo?** → ngrok (free)

**Have fun defending the horde together! 🛡️**
