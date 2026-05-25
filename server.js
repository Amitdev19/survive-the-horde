const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const WORLD = { width: 960, height: 576, tile: 32 };
const DAY_LENGTH = 96;
const BROADCAST_RATE = 15;
const TICK_RATE = 30;
const STATIC_ROOT = path.join(__dirname, "client", "dist");
const DEFAULT_ROOM = "meadow";
const MAX_PLAYERS_PER_ROOM = 16;
const EMPTY_ROOM_TTL = 1000 * 60 * 8;

const TOWER_DEFS = {
  arrow: { label: "Archer", cost: { wood: 25 }, damage: 10, range: 140, cooldown: 0.4, splash: 0 },
  cannon: { label: "Cannon", cost: { wood: 15, stone: 30 }, damage: 28, range: 120, cooldown: 1.0, splash: 40 },
  frost: { label: "Frost", cost: { stone: 20, food: 10 }, damage: 6, range: 110, cooldown: 0.35, slow: 0.6, slowDuration: 1.5 },
  garden: { label: "Garden", cost: { wood: 20, food: 6 }, damage: 0, range: 0, cooldown: 0, produceEvery: 6 },
  laser: { label: "Laser", cost: { stone: 36, wood: 18, crystal: 4 }, damage: 18, range: 180, cooldown: 0.5, pierce: 3, unlockTier: 2 },
  bomb: { label: "Bomb", cost: { wood: 32, stone: 22, crystal: 4 }, damage: 40, range: 100, cooldown: 1.2, splash: 70, unlockTier: 2 },
  tesla: { label: "Tesla", cost: { stone: 46, food: 14, crystal: 7 }, damage: 15, range: 130, cooldown: 0.6, splash: 42, chain: 2, unlockTier: 3 },
  sniper: { label: "Sniper", cost: { wood: 36, stone: 20, crystal: 8 }, damage: 50, range: 200, cooldown: 1.8, pierceAll: true, unlockTier: 3 },
};

const ENEMY_DEFS = {
  grunt: { hp: 42, speed: 48, damage: 9, reward: { wood: 2 }, score: 8 },
  runner: { hp: 24, speed: 82, damage: 6, reward: { food: 1 }, score: 10 },
  brute: { hp: 118, speed: 34, damage: 20, reward: { stone: 3, crystal: 1 }, score: 24 },
};

const PLAYER_COLORS = ["#e56b3f", "#77c6d8", "#a7d56e", "#d9b45f", "#b83b3b", "#87919e"];

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
    this.createdAt = Date.now();
    this.lastEmptyAt = null;
    this.events = [];
    this.state = this.createInitialState();
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
      nextSupplyIn: 28,
      pendingSpawns: [],
      wave: 0,
      score: 0,
      techTier: 1,
      resources: { wood: 96, stone: 68, food: 34, crystal: 0 },
      base: { x: 160, y: 288, hp: 430, maxHp: 430 },
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
      ["wood", 80, 76], ["wood", 114, 136], ["wood", 285, 82], ["wood", 415, 486],
      ["wood", 520, 88], ["wood", 760, 438], ["wood", 870, 110],
      ["stone", 90, 486], ["stone", 270, 446], ["stone", 586, 148], ["stone", 842, 324], ["stone", 724, 88],
      ["food", 230, 166], ["food", 382, 372], ["food", 628, 430], ["food", 806, 206],
    ];

    return seeds.map(([type, x, y]) => {
      const max = type === "wood" ? 64 : type === "stone" ? 50 : 42;
      return { id: `n${this.nextNodeId++}`, type, x, y, amount: max, max, regen: 0, hitFlash: 0 };
    });
  }

  addSession(session) {
    if (this.sessions.size >= MAX_PLAYERS_PER_ROOM) {
      session.socket.send(JSON.stringify({ type: "error", message: "Room is full." }));
      session.socket.close(1008, "room full");
      return false;
    }

    this.sessions.add(session);
    this.lastEmptyAt = null;
    const spawnOffset = Object.keys(this.state.players).length;
    this.state.players[session.playerId] = {
      id: session.playerId,
      name: `Player ${session.playerId.slice(1)}`,
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
    return true;
  }

  removeSession(session) {
    this.sessions.delete(session);
    delete this.state.players[session.playerId];
    if (this.sessions.size === 0) this.lastEmptyAt = Date.now();
    this.pushEvent("leave", this.state.base.x, this.state.base.y - 42, "left");
  }

  restart() {
    this.state = this.createInitialState(this.state.players);
    this.events = [];
    this.pushEvent("restart", this.state.base.x, this.state.base.y - 42, "new run");
  }

  handleMessage(session, message) {
    const player = this.state.players[session.playerId];
    if (!player) return;
    player.lastSeen = Date.now();

    if (message.type === "hello") {
      player.name = sanitizeName(message.name || player.name);
      if (message.roomId && message.roomId !== this.id) moveSessionToRoom(session, message.roomId);
      return;
    }

    if (message.type === "ping") {
      session.socket.send(JSON.stringify({ type: "pong", time: Date.now() }));
      return;
    }

    if (message.type === "restart") {
      this.restart();
      return;
    }

    if (this.state.gameOver) return;

    if (message.type === "input") {
      const x = clamp(Number(message.x) || 0, -1, 1);
      const y = clamp(Number(message.y) || 0, -1, 1);
      const length = Math.hypot(x, y) || 1;
      player.input = { x: x / length, y: y / length };
      return;
    }

    if (message.type === "interact") return this.gatherResource(player, message.targetId);
    if (message.type === "build") return this.buildTower(player, message.towerType, message.x, message.y);
    if (message.type === "upgrade") return this.upgradeTower(message.towerId);
    if (message.type === "repair") this.repairBase(player);
  }

  gatherResource(player, targetId) {
    if (this.state.time - player.lastGather < 0.34) return;
    player.lastGather = this.state.time;

    const candidates = this.state.nodes.filter((entry) => entry.amount > 0);
    const node = targetId ? candidates.find((entry) => entry.id === targetId) : nearest(candidates, player.x, player.y, 54);
    if (!node || distance(node.x, node.y, player.x, player.y) > 58) {
      player.action = { type: "reach", label: "Too far", until: this.state.time + 0.5 };
      return;
    }

    const amount = node.type === "stone" ? 2 : node.type === "food" ? 3 : 4;
    node.amount = Math.max(0, node.amount - amount);
    node.hitFlash = 0.24;
    this.state.resources[node.type] += amount;
    this.state.score += 1;
    const verb = node.type === "wood" ? "chopped" : node.type === "food" ? "picked" : "mined";
    player.action = { type: node.type, targetId: node.id, label: verb, until: this.state.time + 0.38 };
    this.state.message = `${player.name} ${verb} ${node.type}.`;
    this.pushEvent("resource", node.x, node.y - 18, `+${amount} ${node.type}`);
  }

  buildTower(player, type, rawX, rawY) {
    const def = TOWER_DEFS[type];
    if (!def || this.state.time - player.lastBuild < 0.18) return;
    player.lastBuild = this.state.time;

    const x = snap(rawX);
    const y = snap(rawY);
    if ((def.unlockTier || 1) > this.state.techTier) return this.pushEvent("deny", player.x, player.y - 18, `tech ${def.unlockTier}`);
    if (!canSpend(this.state.resources, def.cost)) return this.pushEvent("deny", player.x, player.y - 18, "need resources");
    if (!this.isBuildable(x, y)) return this.pushEvent("deny", x, y - 18, "blocked");

    spend(this.state.resources, def.cost);
    this.state.towers.push({ id: `t${this.nextTowerId++}`, type, x, y, level: 1, cooldown: type === "garden" ? def.produceEvery : 0.2 });
    this.state.message = `${def.label} built.`;
    this.pushEvent("build", x, y - 20, "built");
  }

  upgradeTower(towerId) {
    const tower = this.state.towers.find((entry) => entry.id === towerId);
    if (!tower || tower.level >= 4) return;

    const cost = { wood: 12 + tower.level * 10, stone: 8 + tower.level * 7 };
    if (tower.type === "garden" || tower.type === "frost") cost.food = 4 + tower.level * 3;
    if ((TOWER_DEFS[tower.type].unlockTier || 1) > 1) cost.crystal = tower.level + 2;
    if (!canSpend(this.state.resources, cost)) return;

    spend(this.state.resources, cost);
    tower.level += 1;
    tower.cooldown = Math.min(tower.cooldown, 0.22);
    this.state.message = `${TOWER_DEFS[tower.type].label} upgraded.`;
    this.pushEvent("upgrade", tower.x, tower.y - 24, `level ${tower.level}`);
  }

  repairBase(player) {
    const cost = { wood: 12, stone: 8, food: 5 };
    if (!canSpend(this.state.resources, cost) || this.state.base.hp >= this.state.base.maxHp) return;
    spend(this.state.resources, cost);
    this.state.base.hp = Math.min(this.state.base.maxHp, this.state.base.hp + 48);
    this.state.message = `${player.name} repaired the base.`;
    this.pushEvent("repair", this.state.base.x, this.state.base.y - 42, "+48 base");
  }

  isBuildable(x, y) {
    if (x < 48 || y < 48 || x > WORLD.width - 48 || y > WORLD.height - 48) return false;
    if (distance(x, y, this.state.base.x, this.state.base.y) < 82) return false;
    if (this.state.towers.some((tower) => distance(x, y, tower.x, tower.y) < 36)) return false;
    if (this.state.nodes.some((node) => node.amount > 0 && distance(x, y, node.x, node.y) < 36)) return false;
    return true;
  }

  update(dt) {
    if (this.state.gameOver) return;

    this.state.time += dt;
    this.state.dayPercent = (this.state.time % DAY_LENGTH) / DAY_LENGTH;
    this.updateWeather(dt);
    this.updatePlayers(dt);
    this.updateResourceNodes(dt);
    this.updateSupplyDrops(dt);
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

  updateSupplyDrops(dt) {
    this.state.nextSupplyIn -= dt;
    if (this.state.nextSupplyIn > 0) return;

    const playerCount = Math.max(1, Object.keys(this.state.players).length);
    this.state.resources.wood += 10 + playerCount * 3;
    this.state.resources.stone += 7 + playerCount * 2;
    this.state.resources.food += 5 + playerCount;
    this.state.resources.crystal += Math.max(1, Math.floor(this.state.wave / 2));
    this.state.nextSupplyIn = Math.max(18, 32 - this.state.wave * 0.8);
    this.state.message = "A shared supply cache arrived.";
    this.pushEvent("resource", this.state.base.x, this.state.base.y - 52, "supply cache");
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
    this.updateTechTier();
    const playerScale = Math.max(0, Object.keys(this.state.players).length - 1);
    const count = 5 + Math.floor(this.state.wave * 1.65) + playerScale * 2;
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

  updateTechTier() {
    const nextTier = this.state.wave >= 5 ? 3 : this.state.wave >= 3 ? 2 : 1;
    if (nextTier > this.state.techTier) {
      this.state.techTier = nextTier;
      this.state.resources.crystal += nextTier === 2 ? 4 : 6;
      this.state.message = `Tech tier ${nextTier} unlocked.`;
      this.pushEvent("upgrade", this.state.base.x, this.state.base.y - 54, `tech ${nextTier}`);
    }
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

      const auraTower = this.state.towers.find((tower) => tower.type === "garden" && distance(tower.x, tower.y, enemy.x, enemy.y) < 74 + tower.level * 10);
      const slow = enemy.slowTimer > 0 || auraTower ? 0.6 : 1;
      const speed = def.speed * mods.enemySpeed * slow;
      const angle = Math.atan2(this.state.base.y - enemy.y, this.state.base.x - enemy.x);
      enemy.x += Math.cos(angle) * speed * dt;
      enemy.y += Math.sin(angle) * speed * dt;

      if (distance(enemy.x, enemy.y, this.state.base.x, this.state.base.y) < 34) {
        this.state.base.hp -= def.damage;
        this.state.enemies.splice(index, 1);
        this.state.message = "The base is under attack.";
        this.pushEvent("damage", this.state.base.x, this.state.base.y - 42, `-${def.damage}`);
      }
    }
  }

  updateTowers(dt) {
    const mods = this.getModifiers();
    this.state.towers.forEach((tower) => {
      const def = TOWER_DEFS[tower.type];

      if (tower.type === "garden") {
        tower.cooldown -= dt;
        if (tower.cooldown <= 0) {
          this.state.resources.food += 2 + tower.level;
          if (this.state.base.hp < this.state.base.maxHp && !this.isNight()) this.state.base.hp = Math.min(this.state.base.maxHp, this.state.base.hp + tower.level);
          tower.cooldown = def.produceEvery * (this.isNight() ? 1.55 : 1) * (this.state.weather === "storm" ? 1.45 : 1);
          this.pushEvent("resource", tower.x, tower.y - 22, `+${2 + tower.level} food`);
        }
        return;
      }

      tower.cooldown -= dt;
      if (tower.cooldown > 0) return;

      const range = def.range * mods.towerRange * (1 + (tower.level - 1) * 0.09);
      const target = nearest(this.state.enemies, tower.x, tower.y, range);
      if (!target) return;

      const damage = def.damage * (1 + (tower.level - 1) * 0.36);
      const damaged = [target];
      this.applyDamage(target, damage);

      if (def.pierce || def.pierceAll) this.applyPierce(tower, target, range, damage, damaged, def);
      if (def.splash) this.applySplash(target, damage, damaged, def.splash);
      if (def.chain) this.applyChain(target, damage, damaged, def);
      if (def.slow) damaged.forEach((enemy) => (enemy.slowTimer = Math.max(enemy.slowTimer, def.slowDuration)));

      this.state.shots.push({ id: `s${this.nextShotId++}`, type: tower.type, x: tower.x, y: tower.y, tx: target.x, ty: target.y, ttl: 0.22, damaged: damaged.length });
      tower.cooldown = def.cooldown * mods.fireDelay * Math.max(0.62, 1 - (tower.level - 1) * 0.08);
    });

    this.state.enemies = this.state.enemies.filter((enemy) => {
      if (enemy.hp > 0) return true;
      const def = ENEMY_DEFS[enemy.type];
      addResources(this.state.resources, def.reward);
      this.state.score += def.score;
      this.pushEvent("defeat", enemy.x, enemy.y - 16, `+${def.score}`);
      return false;
    });
  }

  applyPierce(tower, target, range, damage, damaged, def) {
    const direction = Math.atan2(target.y - tower.y, target.x - tower.x);
    this.state.enemies.forEach((enemy) => {
      if (enemy.id === target.id || damaged.includes(enemy)) return;
      const angle = Math.atan2(enemy.y - tower.y, enemy.x - tower.x);
      const diff = Math.abs(Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction)));
      const limit = def.pierceAll ? Number.POSITIVE_INFINITY : def.pierce + 1;
      if (diff < (def.pierceAll ? 0.25 : 0.3) && distance(enemy.x, enemy.y, tower.x, tower.y) < range && damaged.length < limit) {
        this.applyDamage(enemy, damage * (def.pierceAll ? 0.5 : 0.7));
        damaged.push(enemy);
      }
    });
  }

  applySplash(target, damage, damaged, radius) {
    this.state.enemies.forEach((enemy) => {
      if (damaged.includes(enemy)) return;
      if (distance(enemy.x, enemy.y, target.x, target.y) < radius) {
        this.applyDamage(enemy, damage * 0.45);
        damaged.push(enemy);
      }
    });
  }

  applyChain(target, damage, damaged, def) {
    let current = target;
    for (let index = 0; index < def.chain; index += 1) {
      const nextTarget = nearest(this.state.enemies.filter((enemy) => !damaged.includes(enemy)), current.x, current.y, def.range * 0.6);
      if (!nextTarget) break;
      this.applyDamage(nextTarget, damage * (0.6 - index * 0.1));
      damaged.push(nextTarget);
      current = nextTarget;
    }
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

  pushEvent(type, x, y, text) {
    this.events.push({ id: `v${this.nextEventId++}`, type, x, y, text, time: this.state.time });
    if (this.events.length > 48) this.events.splice(0, this.events.length - 48);
  }

  snapshot() {
    return {
      roomId: this.id,
      serverTime: Date.now(),
      world: this.state.world,
      time: this.state.time,
      dayPercent: this.state.dayPercent,
      isNight: this.isNight(),
      weather: this.state.weather,
      weatherTimer: this.state.weatherTimer,
      wave: this.state.wave,
      nextWaveIn: this.state.nextWaveIn,
      nextSupplyIn: this.state.nextSupplyIn,
      score: this.state.score,
      techTier: this.state.techTier,
      resources: this.state.resources,
      base: this.state.base,
      towers: this.state.towers,
      enemies: this.state.enemies,
      nodes: this.state.nodes,
      players: Object.values(this.state.players),
      playerCount: Object.keys(this.state.players).length,
      shots: this.state.shots,
      gameOver: this.state.gameOver,
      message: this.state.message,
      towerDefs: TOWER_DEFS,
      unlockedTowers: Object.entries(TOWER_DEFS).filter(([, def]) => (def.unlockTier || 1) <= this.state.techTier).map(([type]) => type),
    };
  }

  summary() {
    return { id: this.id, players: this.sessions.size, wave: this.state.wave, score: this.state.score, techTier: this.state.techTier, createdAt: this.createdAt };
  }

  broadcast() {
    if (this.sessions.size === 0) return;
    const payload = JSON.stringify({ type: "state", state: this.snapshot(), events: this.events.splice(0) });
    this.sessions.forEach((session) => {
      if (session.socket.readyState === WebSocket.OPEN) session.socket.send(payload);
    });
  }
}

function getRoom(id = DEFAULT_ROOM) {
  const roomId = sanitizeRoomId(id);
  if (!rooms.has(roomId)) rooms.set(roomId, new GameRoom(roomId));
  return rooms.get(roomId);
}

function moveSessionToRoom(session, roomId) {
  const nextRoom = getRoom(roomId);
  if (session.room === nextRoom) return;
  session.room.removeSession(session);
  session.room = nextRoom;
  if (nextRoom.addSession(session)) session.socket.send(JSON.stringify({ type: "welcome", playerId: session.playerId, roomId: nextRoom.id }));
}

function sanitizeName(name) {
  return String(name).trim().replace(/[^\w .-]/g, "").slice(0, 16) || "Player";
}

function sanitizeRoomId(roomId) {
  return String(roomId || DEFAULT_ROOM).trim().replace(/[^\w-]/g, "").slice(0, 24) || DEFAULT_ROOM;
}

function canSpend(resources, cost) {
  return Object.entries(cost).every(([key, amount]) => (resources[key] || 0) >= amount);
}

function spend(resources, cost) {
  Object.entries(cost).forEach(([key, amount]) => {
    resources[key] -= amount;
  });
}

function addResources(resources, reward) {
  Object.entries(reward).forEach(([key, amount]) => {
    resources[key] = (resources[key] || 0) + amount;
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

function roomList() {
  return [...rooms.values()].map((room) => room.summary());
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    players: [...rooms.values()].reduce((sum, room) => sum + room.sessions.size, 0),
    uptime: process.uptime(),
  });
});

app.get("/api/rooms", (_req, res) => {
  res.json({ rooms: roomList() });
});

app.post("/api/rooms", (_req, res) => {
  const roomId = `room-${Math.random().toString(36).slice(2, 8)}`;
  getRoom(roomId);
  res.status(201).json({ roomId, path: `/?room=${encodeURIComponent(roomId)}` });
});

app.use(express.static(STATIC_ROOT, { index: false, maxAge: "1y" }));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(STATIC_ROOT, "index.html"), (error) => {
    if (error) res.status(404).send("Build the client first with: npm run build");
  });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (socket, req) => {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  const session = {
    id: `s${nextSessionId++}`,
    playerId: `p${nextPlayerId++}`,
    socket,
    room: getRoom(requestUrl.searchParams.get("room") || DEFAULT_ROOM),
  };

  if (!session.room.addSession(session)) return;
  socket.send(JSON.stringify({ type: "welcome", playerId: session.playerId, roomId: session.room.id }));

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    session.room.handleMessage(session, message);
  });

  socket.on("close", () => {
    session.room.removeSession(session);
  });
});

setInterval(() => {
  rooms.forEach((room, id) => {
    room.update(1 / TICK_RATE);
    if (room.sessions.size === 0 && id !== DEFAULT_ROOM && room.lastEmptyAt && Date.now() - room.lastEmptyAt > EMPTY_ROOM_TTL) rooms.delete(id);
  });
}, 1000 / TICK_RATE);

setInterval(() => {
  rooms.forEach((room) => room.broadcast());
}, 1000 / BROADCAST_RATE);

let selectedPort = Number(process.env.PORT) || 3000;
server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && !process.env.PORT && selectedPort < 3010) {
    selectedPort += 1;
    server.listen(selectedPort, "0.0.0.0");
    return;
  }
  throw error;
});

server.listen(selectedPort, "0.0.0.0", () => {
  console.log(`Survive the Horde is running at http://localhost:${selectedPort}`);
  console.log("Use /?room=your-room-name to invite players to a shared room.");
});
