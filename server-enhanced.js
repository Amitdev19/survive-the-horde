#!/usr/bin/env node
/**
 * Enhanced Server with Auto-Configuration
 * Supports local network and cloud deployment
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const os = require("os");

// ============================================================================
// Configuration
// ============================================================================

const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  enableCors: process.env.ENABLE_CORS !== "false",
  logConnections: process.env.LOG_CONNECTIONS !== "false",
  maxRooms: Number(process.env.MAX_ROOMS) || 100,
  roomTimeout: Number(process.env.ROOM_TIMEOUT) || 3600000, // 1 hour
};

// ============================================================================
// Utilities
// ============================================================================

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

function log(message, type = "info") {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${type.toUpperCase()}]`;
  console.log(`${prefix} ${message}`);
}

// ============================================================================
// Server Setup
// ============================================================================

const WORLD = { width: 960, height: 576, tile: 32 };
const DAY_LENGTH = 96;
const BROADCAST_RATE = 15;
const TICK_RATE = 30;
const STATIC_ROOT = path.join(__dirname, "client", "dist");
const DEFAULT_ROOM = "meadow";

const TOWER_DEFS = {
  arrow: { label: "Archer", cost: { wood: 30 }, damage: 12, range: 150, cooldown: 0.46, splash: 0 },
  cannon: { label: "Cannon", cost: { wood: 18, stone: 36 }, damage: 32, range: 132, cooldown: 1.12, splash: 42 },
  frost: {
    label: "Frost",
    cost: { stone: 24, food: 12 },
    damage: 7,
    range: 118,
    cooldown: 0.36,
    splash: 0,
    slow: 0.56,
    slowDuration: 1.6,
  },
  garden: { label: "Garden", cost: { wood: 24, food: 8 }, damage: 0, range: 0, cooldown: 0, splash: 0, produceEvery: 7 },
};

const ENEMY_DEFS = {
  grunt: { hp: 42, speed: 48, damage: 9, reward: { wood: 2 }, score: 8 },
  runner: { hp: 24, speed: 82, damage: 6, reward: { food: 1 }, score: 10 },
  brute: { hp: 118, speed: 34, damage: 20, reward: { stone: 3 }, score: 24 },
};

const PLAYER_COLORS = ["#e56b3f", "#77c6d8", "#a7d56e", "#d9b45f", "#b83b3b", "#87919e"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// ============================================================================
// Game Room Class (unchanged from original)
// ============================================================================

let nextPlayerId = 1;
let nextSessionId = 1;
const rooms = new Map();

class GameRoom {
  constructor(id) {
    this.id = id;
    this.sessions = new Set();
    this.nextTowerId = 1;
    this.nextEnemyId = 1;
    this.nextNodeId = 1;
    this.nextShotId = 1;
    this.nextEventId = 1;
    this.events = [];
    this.state = this.createInitialState();
    this.createdAt = Date.now();
  }

  createInitialState(existingPlayers = {}) {
    this.nextTowerId = 1;
    this.nextEnemyId = 1;
    this.nextNodeId = 1;
    this.nextShotId = 1;

    const players = {};
    Object.values(existingPlayers).forEach((player, index) => {
      players[player.id] = {
        ...player,
        x: 150 + (index % 3) * 24,
        y: 330 + Math.floor(index / 3) * 24,
        input: { x: 0, y: 0 },
        action: null,
        lastGather: 0,
        lastBuild: 0,
        lastSeen: Date.now(),
      };
    });

    return {
      world: WORLD,
      time: 0,
      dayPercent: 0.28,
      weather: "clear",
      weatherTimer: 38,
      nextWaveIn: 4,
      pendingSpawns: [],
      wave: 0,
      score: 0,
      resources: { wood: 96, stone: 68, food: 34 },
      base: { x: 160, y: 288, hp: 390, maxHp: 390 },
      towers: [],
      enemies: [],
      nodes: this.createResourceNodes(),
      shots: [],
      players,
      gameOver: false,
      message: "Gather supplies before the first wave.",
    };
  }

  createResourceNodes() {
    const seeds = [
      ["wood", 80, 76],
      ["wood", 114, 136],
      ["wood", 285, 82],
      ["wood", 415, 486],
      ["wood", 520, 88],
      ["wood", 760, 438],
      ["wood", 870, 110],
      ["stone", 90, 486],
      ["stone", 270, 446],
      ["stone", 586, 148],
      ["stone", 842, 324],
      ["stone", 724, 88],
      ["food", 230, 166],
      ["food", 382, 372],
      ["food", 628, 430],
      ["food", 806, 206],
    ];

    return seeds.map(([type, x, y]) => {
      const max = type === "wood" ? 64 : type === "stone" ? 50 : 42;
      return { id: `n${this.nextNodeId++}`, type, x, y, amount: max, max, regen: 0, hitFlash: 0 };
    });
  }

  addSession(session) {
    this.sessions.add(session);
    const spawnOffset = Object.keys(this.state.players).length;
    this.state.players[session.playerId] = {
      id: session.playerId,
      name: session.playerName || `Player ${session.playerId.slice(1)}`,
      color: PLAYER_COLORS[(nextPlayerId - 2) % PLAYER_COLORS.length],
      x: 150 + (spawnOffset % 3) * 24,
      y: 330 + Math.floor(spawnOffset / 3) * 24,
      input: { x: 0, y: 0 },
      action: null,
      lastGather: 0,
      lastBuild: 0,
      lastSeen: Date.now(),
    };
    this.pushEvent("join", this.state.players[session.playerId].x, this.state.players[session.playerId].y, "joined");
  }

  removeSession(session) {
    this.sessions.delete(session);
    delete this.state.players[session.playerId];
  }

  broadcast() {
    const stateMessage = JSON.stringify({ type: "state", state: this.state, events: this.events });
    const eventsCopy = [...this.events];
    this.events = [];
    for (const session of this.sessions) {
      if (session.socket.readyState === WebSocket.OPEN) {
        session.socket.send(stateMessage);
      }
    }
  }

  pushEvent(type, x, y, text) {
    this.events.push({ id: `v${this.nextEventId++}`, type, x, y, text, time: this.state.time });
    if (this.events.length > 36) this.events.splice(0, this.events.length - 36);
  }

  update(dt) {
    this.state.time += dt;
    this.state.dayPercent = (this.state.time % DAY_LENGTH) / DAY_LENGTH;
    this.updateWeather(dt);
    this.updatePlayers(dt);
    this.updateResourceNodes(dt);
    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateShots(dt);

    if (this.state.base.hp <= 0) {
      this.state.base.hp = 0;
      this.state.gameOver = true;
      this.state.message = "The horde broke the base. Restart to try again.";
      this.pushEvent("warning", this.state.base.x, this.state.base.y - 42, "base lost");
    }
  }

  updateWeather(dt) {
    this.state.weatherTimer -= dt;
    if (this.state.weatherTimer > 0) return;

    const roll = Math.random();
    if (roll < 0.42) this.state.weather = "clear";
    else if (roll < 0.66) this.state.weather = "rain";
    else if (roll < 0.86) this.state.weather = "fog";
    else this.state.weather = "storm";

    this.state.weatherTimer = this.state.weather === "clear" ? 34 + Math.random() * 20 : 18 + Math.random() * 14;
    this.state.message = `Weather changed: ${this.state.weather}.`;
    this.pushEvent("weather", this.state.base.x, 48, this.state.weather);
  }

  updatePlayers(dt) {
    const mods = this.getModifiers();
    Object.values(this.state.players).forEach((player) => {
      player.x = clamp(player.x + player.input.x * 124 * mods.playerSpeed * dt, 16, WORLD.width - 16);
      player.y = clamp(player.y + player.input.y * 124 * mods.playerSpeed * dt, 16, WORLD.height - 16);
      if (player.action && player.action.until <= this.state.time) player.action = null;
    });
  }

  updateResourceNodes(dt) {
    this.state.nodes.forEach((node) => {
      node.hitFlash = Math.max(0, node.hitFlash - dt);
      if (node.amount >= node.max) return;
      node.regen += dt;
      const regenDelay = node.type === "food" ? 2.6 : 4.2;
      if (node.regen >= regenDelay) {
        node.amount += 1;
        node.regen = 0;
      }
    });
  }

  updateWaves(dt) {
    this.state.nextWaveIn -= dt;
    if (this.state.nextWaveIn <= 0) this.startWave();

    for (let index = this.state.pendingSpawns.length - 1; index >= 0; index -= 1) {
      const pending = this.state.pendingSpawns[index];
      pending.delay -= dt;
      if (pending.delay <= 0) {
        this.spawnEnemy(pending.type);
        this.state.pendingSpawns.splice(index, 1);
      }
    }
  }

  startWave() {
    this.state.wave += 1;
    const count = 5 + Math.floor(this.state.wave * 1.65);
    for (let index = 0; index < count; index += 1) {
      let type = "grunt";
      const roll = Math.random();
      if (this.state.wave > 2 && roll < 0.23) type = "runner";
      if (this.state.wave > 4 && roll > 0.78) type = "brute";
      this.state.pendingSpawns.push({ type, delay: index * 0.72 + Math.random() * 0.7 });
    }

    this.state.nextWaveIn = Math.max(14, 30 - this.state.wave * 0.55);
    this.state.message = `Wave ${this.state.wave} approaches.`;
    this.pushEvent("wave", this.state.base.x, 58, `wave ${this.state.wave}`);
  }

  spawnEnemy(type) {
    const def = ENEMY_DEFS[type];
    const laneRoll = Math.random();
    let x = WORLD.width + 24;
    let y = 80 + Math.random() * (WORLD.height - 160);
    if (laneRoll > 0.72) {
      x = 600 + Math.random() * 290;
      y = laneRoll > 0.86 ? -24 : WORLD.height + 24;
    }

    const hp = def.hp + this.state.wave * (type === "brute" ? 10 : 4);
    this.state.enemies.push({ id: `e${this.nextEnemyId++}`, type, x, y, hp, maxHp: hp, slowTimer: 0, hurtFlash: 0 });
  }

  updateEnemies(dt) {
    const mods = this.getModifiers();
    for (let index = this.state.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.state.enemies[index];
      const def = ENEMY_DEFS[enemy.type];
      enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
      enemy.hurtFlash = Math.max(0, enemy.hurtFlash - dt);

      const targetBase = true;
      const dxBase = this.state.base.x - enemy.x;
      const dyBase = this.state.base.y - enemy.y;
      const distBase = Math.hypot(dxBase, dyBase);
      const speedMod = mods.enemySpeed * (1 - Math.min(enemy.slowTimer / 1.6, 0.56));
      const px = (dxBase / distBase) * def.speed * speedMod * dt;
      const py = (dyBase / distBase) * def.speed * speedMod * dt;
      enemy.x += px;
      enemy.y += py;

      if (distance(enemy.x, enemy.y, this.state.base.x, this.state.base.y) < 36) {
        this.state.base.hp -= def.damage * dt;
        this.pushEvent("hit", enemy.x, enemy.y, `-${Math.floor(def.damage * dt)}`);
      }
    }

    this.state.enemies = this.state.enemies.filter((enemy) => {
      if (enemy.hp > 0) return true;
      const def = ENEMY_DEFS[enemy.type];
      addResources(this.state.resources, def.reward);
      this.state.score += def.score;
      this.pushEvent("defeat", enemy.x, enemy.y - 16, `+${def.score}`);
      return false;
    });
  }

  updateTowers(dt) {
    const mods = this.getModifiers();
    this.state.towers.forEach((tower) => {
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      if (tower.cooldown > 0) return;

      const def = TOWER_DEFS[tower.type];
      if (!def) return;

      const target = nearest(
        this.state.enemies.filter((e) => e.hp > 0),
        tower.x,
        tower.y,
        def.range * mods.towerRange
      );
      if (!target) return;

      const damage = def.damage * (1 + (tower.level - 1) * 0.26);
      this.applyDamage(target, damage);
      if (def.splash)
        this.state.enemies.forEach((enemy) => {
          if (enemy.id !== target.id && distance(enemy.x, enemy.y, target.x, target.y) < def.splash) this.applyDamage(enemy, damage * 0.46);
        });

      if (def.slow) target.slowTimer = Math.max(target.slowTimer, def.slowDuration);

      this.state.shots.push({ id: `s${this.nextShotId++}`, type: tower.type, x: tower.x, y: tower.y, tx: target.x, ty: target.y, ttl: 0.22 });
      tower.cooldown = def.cooldown * mods.fireDelay * Math.max(0.62, 1 - (tower.level - 1) * 0.08);
    });
  }

  applyDamage(enemy, damage) {
    enemy.hp -= damage;
    enemy.hurtFlash = 0.08;
  }

  updateShots(dt) {
    this.state.shots.forEach((shot) => {
      shot.ttl -= dt;
    });
    this.state.shots = this.state.shots.filter((shot) => shot.ttl > 0);
  }

  getModifiers() {
    const night = this.isNight();
    const mods = { towerRange: night ? 0.86 : 1, enemySpeed: night ? 1.18 : 1, playerSpeed: 1, fireDelay: 1 };
    if (this.state.weather === "rain") mods.fireDelay *= 1.12;
    if (this.state.weather === "fog") mods.towerRange *= 0.76;
    if (this.state.weather === "storm") {
      mods.enemySpeed *= 1.08;
      mods.playerSpeed *= 0.88;
      mods.fireDelay *= 1.08;
    }
    return mods;
  }

  isNight() {
    return this.state.dayPercent > 0.58 || this.state.dayPercent < 0.12;
  }
}

// ============================================================================
// WebSocket & HTTP Handlers
// ============================================================================

const server = http.createServer(serveStatic);
const wss = new WebSocket.Server({ server });

wss.on("connection", (socket) => {
  const session = {
    id: `s${nextSessionId++}`,
    playerId: `p${nextPlayerId++}`,
    socket,
    room: getRoom(DEFAULT_ROOM),
    playerName: null,
  };

  if (config.logConnections) {
    log(`Player ${session.playerId} connected (total: ${wss.clients.size})`);
  }

  session.room.addSession(session);
  socket.send(JSON.stringify({ type: "welcome", playerId: session.playerId, roomId: session.room.id }));

  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === "hello") {
        session.playerName = sanitizeName(message.name);
        session.room.state.players[session.playerId].name = session.playerName;
        return;
      }

      const room = session.room;
      const state = room.state;
      const player = state.players[session.playerId];
      if (!player) return;
      player.lastSeen = Date.now();

      if (message.type === "input") {
        player.input = { x: clamp(message.x, -1, 1), y: clamp(message.y, -1, 1) };
        return;
      }

      if (message.type === "gather") {
        if (state.time - player.lastGather < 0.4) return;
        const node = nearest(state.nodes, player.x, player.y, 32);
        if (!node || node.amount === 0) return;
        node.amount -= 1;
        node.hitFlash = 0.1;
        addResources(state.resources, { [node.type]: 1 });
        player.lastGather = state.time;
        player.action = { type: "gather", until: state.time + 0.32 };
        room.pushEvent("gather", player.x, player.y, node.type);
        return;
      }

      if (message.type === "action") {
        const towerType = message.towerType || "arrow";
        if (!TOWER_DEFS[towerType]) return;
        const def = TOWER_DEFS[towerType];

        if (message.action === "build") {
          if (!canSpend(state.resources, def.cost)) return;
          if (state.time - player.lastBuild < 0.6) return;
          const x = snap(message.x);
          const y = snap(message.y);
          const occupied = state.towers.some((tower) => tower.x === x && tower.y === y) || distance(x, y, state.base.x, state.base.y) < 48;
          if (occupied) return;
          spend(state.resources, def.cost);
          state.towers.push({ id: `t${room.nextTowerId++}`, type: towerType, x, y, hp: 32, maxHp: 32, level: 1, cooldown: 0, owner: session.playerId });
          player.lastBuild = state.time;
          player.action = { type: "build", until: state.time + 0.8 };
          room.pushEvent("build", x, y, def.label);
          return;
        }

        if (message.action === "upgrade") {
          const tower = state.towers.find((t) => t.id === message.towerId);
          if (!tower) return;
          const def = TOWER_DEFS[tower.type];
          const upgradeCost = { wood: 24 + (tower.level - 1) * 12, stone: (tower.level - 1) * 12 };
          if (!canSpend(state.resources, upgradeCost)) return;
          spend(state.resources, upgradeCost);
          tower.level += 1;
          room.pushEvent("upgrade", tower.x, tower.y, `level ${tower.level}`);
          return;
        }

        if (message.action === "repair") {
          const repairCost = { wood: 18 };
          if (state.base.hp >= state.base.maxHp || !canSpend(state.resources, repairCost)) return;
          spend(state.resources, repairCost);
          state.base.hp = Math.min(state.base.hp + 32, state.base.maxHp);
          room.pushEvent("repair", state.base.x, state.base.y, "+repair");
          return;
        }
      }
    } catch (error) {
      log(`Message parsing error: ${error.message}`, "error");
    }
  });

  socket.addEventListener("close", () => {
    if (config.logConnections) {
      log(`Player ${session.playerId} disconnected (total: ${wss.clients.size})`);
    }
    session.room.removeSession(session);
    if (session.room.sessions.size === 0 && session.room.id !== DEFAULT_ROOM && Date.now() - session.room.createdAt > config.roomTimeout) {
      rooms.delete(session.room.id);
    }
  });

  socket.addEventListener("error", (error) => {
    log(`WebSocket error for ${session.playerId}: ${error.message}`, "error");
  });
});

function getRoom(roomId) {
  const sanitizedId = sanitizeRoomId(roomId);
  let room = rooms.get(sanitizedId);
  if (!room) {
    if (rooms.size >= config.maxRooms) {
      log("Max rooms reached, cannot create new room", "warn");
      return rooms.get(DEFAULT_ROOM) || createDefaultRoom();
    }
    room = new GameRoom(sanitizedId);
    rooms.set(sanitizedId, room);
  }
  return room;
}

function createDefaultRoom() {
  const room = new GameRoom(DEFAULT_ROOM);
  rooms.set(DEFAULT_ROOM, room);
  return room;
}

function serveStatic(req, res) {
  // CORS headers
  if (config.enableCors) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD");
  }

  const requestUrl = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.normalize(path.join(STATIC_ROOT, pathname));
  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      const indexPath = path.join(STATIC_ROOT, "index.html");
      fs.readFile(indexPath, (indexErr, indexData) => {
        if (indexErr) {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("Build the client first with: npm run build");
          return;
        }
        res.writeHead(200, { "content-type": MIME[".html"] });
        res.end(indexData);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-cache" : "public, max-age=31536000",
    });
    res.end(data);
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

function sanitizeName(name) {
  return String(name).trim().replace(/[^\w .-]/g, "").slice(0, 16) || "Player";
}

function sanitizeRoomId(roomId) {
  return String(roomId || DEFAULT_ROOM).trim().replace(/[^\w-]/g, "").slice(0, 24) || DEFAULT_ROOM;
}

function canSpend(resources, cost) {
  return Object.entries(cost).every(([key, amount]) => resources[key] >= amount);
}

function spend(resources, cost) {
  Object.entries(cost).forEach(([key, amount]) => {
    resources[key] -= amount;
  });
}

function addResources(resources, reward) {
  Object.entries(reward).forEach(([key, amount]) => {
    resources[key] += amount;
  });
}

function snap(value) {
  return Math.floor(clamp(Number(value) || 0, 0, WORLD.width - 1) / WORLD.tile) * WORLD.tile + WORLD.tile / 2;
}

function nearest(items, x, y, maxDistance) {
  let best = null;
  let bestDistance = maxDistance;
  items.forEach((item) => {
    const current = distance(item.x, item.y, x, y);
    if (current <= bestDistance) {
      best = item;
      bestDistance = current;
    }
  });
  return best;
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ============================================================================
// Game Loop
// ============================================================================

setInterval(() => {
  rooms.forEach((room) => {
    room.update(1 / TICK_RATE);
    if (room.sessions.size === 0 && room.id !== DEFAULT_ROOM && Date.now() - room.createdAt > config.roomTimeout) {
      rooms.delete(room.id);
    }
  });
}, 1000 / TICK_RATE);

setInterval(() => {
  rooms.forEach((room) => room.broadcast());
}, 1000 / BROADCAST_RATE);

// ============================================================================
// Server Startup
// ============================================================================

// Ensure default room exists
createDefaultRoom();

let selectedPort = config.port;
server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && !process.env.PORT && selectedPort < config.port + 10) {
    selectedPort += 1;
    server.listen(selectedPort, config.host);
    return;
  }
  throw error;
});

server.listen(selectedPort, config.host, () => {
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const host = process.env.NODE_ENV === "production" ? "your-domain.com" : getLocalIp();
  const displayUrl = `${protocol}://${host}:${selectedPort}`;

  log("╔════════════════════════════════════════════════════════════════╗");
  log("║     🛡️  SURVIVE THE HORDE - Multiplayer Tower Defense       ║");
  log("╠════════════════════════════════════════════════════════════════╣");
  log(`║ Server running at: ${displayUrl}`, "info");
  log(`║ WebSocket: ${protocol === "https" ? "wss" : "ws"}://${host}:${selectedPort}`, "info");
  log(`║ Environment: ${config.nodeEnv}`, "info");
  log("║                                                                ║");
  log("║ To play with friends:                                          ║");
  log(`║ 1. Open in your browser: ${displayUrl}`, "info");
  log(`║ 2. Share the URL with friends (same network)                   ║`, "info");
  log(`║ 3. Or use ngrok to share online:                               ║`, "info");
  log(`║    ngrok http ${selectedPort}                                        ║`, "info");
  log("╚════════════════════════════════════════════════════════════════╝");
});

// Graceful shutdown
process.on("SIGINT", () => {
  log("Shutting down gracefully...");
  wss.close(() => {
    server.close(() => {
      log("Server closed");
      process.exit(0);
    });
  });
});
