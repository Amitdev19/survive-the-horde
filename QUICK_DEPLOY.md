# Survive the Horde - Quick Deploy Guide

## 🎮 Getting Started

### Local Play (Same Device)
```bash
npm start
# Open http://localhost:3000 in 2+ browser tabs
```

### Local Network Play (Same WiFi)
```bash
# Windows: Run start-multiplayer.bat
# Mac/Linux: bash start-multiplayer.sh

# Or manually:
ipconfig  # Windows
hostname -I  # Linux
# Share http://YOUR_IP:3000 with friends
```

---

## ☁️ Cloud Deployment (Internet Multiplayer)

### Option 1: Railway.app (Recommended)
```bash
# 1. Create account: https://railway.app
# 2. Create new project
# 3. Select "GitHub" and connect your repo
# 4. It auto-deploys on git push
# 5. Get public URL from Railway dashboard
```

### Option 2: Render.com
```bash
# 1. Go to https://render.com
# 2. Create new "Web Service"
# 3. Connect GitHub repo
# 4. Build: npm run build
# 5. Start: npm start
```

### Option 3: Heroku (ending free tier)
```bash
# 1. Install Heroku CLI
# 2. heroku create your-game-name
# 3. git push heroku main
# 4. Open https://your-game-name.herokuapp.com
```

### Option 4: ngrok (Temporary public URL)
```bash
# 1. Download ngrok: https://ngrok.com
# 2. npm start  # Start server
# 3. ngrok http 3000  # In another terminal
# 4. Share ngrok URL with friends
```

---

## 🔧 Environment Variables

```bash
# .env file (for production)
PORT=3000
NODE_ENV=production
MAX_ROOMS=100
ROOM_TIMEOUT=3600000
ENABLE_CORS=true
LOG_CONNECTIONS=true
```

---

## 📊 Troubleshooting

### Firewall Blocking
- Windows: Allow Node.js in Firewall
- Mac: System Preferences → Security & Privacy → Firewall

### Connection Failed
1. Ensure server is running: `npm start`
2. Check port is available: `lsof -i :3000` (Mac/Linux)
3. Use correct IP: Not `localhost`, use actual IP address

### WebSocket Disconnected
- Check browser console (F12) for errors
- Verify server and client same version
- Try hard refresh: Ctrl+Shift+R

---

## 🚀 Production Checklist

- [ ] Build client: `npm run build`
- [ ] Test locally: `npm start`
- [ ] Deploy to cloud platform
- [ ] Set PORT environment variable
- [ ] Enable HTTPS (platform handles)
- [ ] Monitor server performance
- [ ] Set up error logging
