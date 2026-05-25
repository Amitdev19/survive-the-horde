# 🎮 Survive the Horde - Quick Reference Card

## 🚀 Three Ways to Play Multiplayer

### 1️⃣ Play Locally (Same Device)
```bash
npm start
# Open http://localhost:3000 in 2+ tabs
```
⏱️ **Setup time**: 1 minute | 👥 **Players**: 2-10 | 💰 **Cost**: Free

---

### 2️⃣ Play with Friends (Same WiFi)
```bash
# Windows:
start-multiplayer.bat

# Mac/Linux:
bash start-multiplayer.sh
```
Then share the displayed URL with friends.

⏱️ **Setup time**: 2 minutes | 👥 **Players**: 2-10 | 💰 **Cost**: Free | 📍 **Range**: Your home/office WiFi

---

### 3️⃣ Play Worldwide (Cloud)
```bash
# Option A: Railway.app (recommended)
git add .
git commit -m "Deploy"
git push heroku main

# Option B: Render.com
# Connect your GitHub repo in Render dashboard

# Option C: ngrok (temporary)
npx ngrok http 3000
```

⏱️ **Setup time**: 5-30 minutes | 👥 **Players**: Unlimited | 💰 **Cost**: $5-10/month or free tier | 📍 **Range**: Worldwide

---

## 📊 Comparison Chart

| Feature | Local | WiFi | Cloud |
|---------|-------|------|-------|
| Setup | 1 min | 2 min | 10 min |
| Cost | Free | Free | Free-$10/mo |
| Friends | 2-10 | 2-10 | Unlimited |
| Range | 1 device | Home WiFi | Worldwide |
| Uptime | While running | While running | 24/7 |
| Difficulty | Easiest | Easy | Medium |

---

## 🆘 Troubleshooting

### "Can't connect"
```bash
# 1. Verify server running
npm start

# 2. Check network connectivity
curl http://localhost:3000

# 3. Try different port
PORT=8080 npm start

# 4. Disable firewall temporarily to test
```

### "Port already in use"
Server automatically tries ports 3001-3010. Or manually:
```bash
PORT=8888 npm start
```

### "Local network doesn't work"
1. Verify both devices on same WiFi
2. Get correct local IP: `ipconfig` (Windows) or `hostname -I` (Linux)
3. Test: Open `http://YOUR_IP:3000` in browser

### "CloudError"
1. Check build output: See cloud platform logs
2. Verify client built: `npm run build`
3. Check environment variables set correctly

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `server.js` | Main game server (use this) |
| `server-enhanced.js` | Alternative with better logging |
| `client/src/main.js` | Game client code |
| `start-multiplayer.bat` | Windows quick-start |
| `start-multiplayer.sh` | Mac/Linux quick-start |
| `railway.toml` | Railway.app config |
| `render.yaml` | Render.com config |
| `Dockerfile` | Docker container config |
| `pre-deploy-check.bat` | Windows verification |
| `pre-deploy-check.sh` | Unix verification |

---

## 📚 Documentation Guide

| Want to... | Read this |
|-----------|-----------|
| Understand everything | MULTIPLAYER_SUMMARY.md |
| Deploy quickly | QUICK_DEPLOY.md |
| See all files created | DEPLOYMENT_FILES_INDEX.md |
| Learn full details | MULTIPLAYER_SETUP.md |
| Verify ready | Run pre-deploy-check.* |

---

## ⚡ Common Commands

```bash
# Build client (required before first deployment)
npm run build

# Start server locally
npm start

# Verify everything works
pre-deploy-check.bat    # Windows
bash pre-deploy-check.sh # Mac/Linux

# Deploy to Railway.app
git add .
git commit -m "Deploy to Railway"
git push

# Deploy with Docker
docker-compose up

# Get your local IP for WiFi sharing
ipconfig              # Windows
hostname -I          # Linux
ipconfig getifaddr en0 # Mac
```

---

## 🎯 Next Steps

### Today
- [ ] Test locally: `npm start`
- [ ] Open 2 browser tabs to verify multiplayer works
- [ ] Run verification: `pre-deploy-check.bat/sh`

### This Week
- [ ] Share URL with friends on WiFi using `start-multiplayer.bat/sh`
- [ ] Get 3+ players in same room for testing
- [ ] Try different scenarios (build towers, defend base, etc.)

### When Ready
- [ ] Choose cloud platform (Railway.app recommended)
- [ ] Follow QUICK_DEPLOY.md instructions
- [ ] Deploy and share public URL with friends worldwide

---

## 💡 Pro Tips

1. **Multiple tabs = local multiplayer**: No need to deploy, just open same URL multiple times
2. **Share local IP = WiFi multiplayer**: Use `http://192.168.X.X:3000` format
3. **Environment vars = easy config**: `PORT=8080 NODE_ENV=production npm start`
4. **Check browser console**: F12 key opens Developer Tools - check Network and Console tabs for errors
5. **Monitor server**: `node server.js` (instead of npm start) shows detailed logs

---

## 🎮 Game Tips

- **Gather resources**: Click on wood/stone/food nodes
- **Build towers**: Select tower type, click on map
- **Upgrade towers**: Click tower to select, click Upgrade
- **Defend base**: Keep base health above 0
- **Wave system**: New zombies appear every 20-30 seconds
- **Team up**: Multiple players share resources and towers

---

## 📞 Support

- **Browser Console**: F12 → Console tab for error messages
- **Server Logs**: Check terminal output when running server
- **Network Debug**: F12 → Network tab → filter "WebSocket"
- **Port Issues**: `lsof -i :3000` (Mac/Linux) shows what's using port

---

## 🚀 You're Ready!

Everything is configured and ready to go. Choose your play style above and have fun with friends! 🛡️🧟

**Happy defending! 🎉**
