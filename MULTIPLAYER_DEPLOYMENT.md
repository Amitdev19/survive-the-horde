# Multiplayer Deployment Notes

`localhost:3000` only works on the same computer. Players on different networks need the Node.js server running on a public host such as Railway, Render, Fly.io, or a VPS.

## Local Play

```powershell
npm install
npm --prefix client install
npm run build
npm start
```

Open:

```text
http://localhost:3000
```

Room links work locally too:

```text
http://localhost:3000/?room=my-squad
```

## Public Play

Deploy the repository, then share the public room URL:

```text
https://your-public-game-url.example/?room=my-squad
```

Everyone who opens the same URL joins the same room.

## Server Endpoints

- `GET /api/health`: uptime, room count, player count.
- `GET /api/rooms`: active room summaries.
- `POST /api/rooms`: creates a new room and returns a room path.

## Current Gameplay Additions

- Crystals are a fourth shared resource.
- Tech tier 2 unlocks Laser and Bomb towers at wave 3.
- Tech tier 3 unlocks Tesla and Sniper towers at wave 5.
- Supply caches periodically add shared resources.
- Enemy wave size scales with player count.
