import Phaser from "phaser";
import "./styles.css";
import { Chiptune } from "./audio.js";
import { PALETTE, PIXEL_ATLAS } from "./pixelAtlas.js";

const WORLD = { width: 960, height: 576, tile: 32 };
const TOWER_UI = {
  arrow: { label: "Archer", key: "tower_arrow", cost: { wood: 25 }, tier: 1 },
  cannon: { label: "Cannon", key: "tower_cannon", cost: { wood: 15, stone: 30 }, tier: 1 },
  frost: { label: "Frost", key: "tower_frost", cost: { stone: 20, food: 10 }, tier: 1 },
  garden: { label: "Garden", key: "tower_garden", cost: { wood: 20, food: 6 }, tier: 1 },
  laser: { label: "Laser", key: "tower_laser", cost: { stone: 36, wood: 18, crystal: 4 }, tier: 2 },
  bomb: { label: "Bomb", key: "tower_bomb", cost: { wood: 32, stone: 22, crystal: 4 }, tier: 2 },
  tesla: { label: "Tesla", key: "tower_tesla", cost: { stone: 46, food: 14, crystal: 7 }, tier: 3 },
  sniper: { label: "Sniper", key: "tower_sniper", cost: { wood: 36, stone: 20, crystal: 8 }, tier: 3 },
};

const dom = {
  wood: document.querySelector("#woodCount"),
  stone: document.querySelector("#stoneCount"),
  food: document.querySelector("#foodCount"),
  crystal: document.querySelector("#crystalCount"),
  baseBar: document.querySelector("#baseBar"),
  baseHp: document.querySelector("#baseHp"),
  status: document.querySelector("#statusLine"),
  wave: document.querySelector("#waveCount"),
  worldState: document.querySelector("#worldState"),
  towerButtons: document.querySelector("#towerButtons"),
  upgrade: document.querySelector("#upgradeButton"),
  repair: document.querySelector("#repairButton"),
  sound: document.querySelector("#soundButton"),
  pause: document.querySelector("#pauseButton"),
  restart: document.querySelector("#restartButton"),
  playerCount: document.querySelector("#playerCount"),
  roomState: document.querySelector("#roomState"),
  techTier: document.querySelector("#techTier"),
  supplyState: document.querySelector("#supplyState"),
  invite: document.querySelector("#inviteButton"),
  newRoom: document.querySelector("#newRoomButton"),
  loading: document.querySelector("#loadingScreen"),
  loadingText: document.querySelector("#loadingText"),
  interactionToast: document.querySelector("#interactionToast"),
  interactionTitle: document.querySelector("#interactionTitle"),
  interactionText: document.querySelector("#interactionText"),
  settingsModal: document.querySelector("#settingsModal"),
  controlsModal: document.querySelector("#controlsModal"),
  closeSettings: document.querySelector("#closeSettings"),
  closeControls: document.querySelector("#closeControls"),
  volumeSlider: document.querySelector("#volumeSlider"),
  volumeValue: document.querySelector("#volumeValue"),
  graphicsSelect: document.querySelector("#graphicsSelect"),
  screenShakeToggle: document.querySelector("#screenShakeToggle"),
  particlesToggle: document.querySelector("#particlesToggle"),
  pauseModal: document.querySelector("#pauseModal"),
  resumeButton: document.querySelector("#resumeButton"),
  gameOverModal: document.querySelector("#gameOverModal"),
  statsWaves: document.querySelector("#statsWaves"),
  statsEnemies: document.querySelector("#statsEnemies"),
  statsTowers: document.querySelector("#statsTowers"),
  statsResources: document.querySelector("#statsResources"),
  statsScore: document.querySelector("#statsScore"),
  retryButton: document.querySelector("#retryButton"),
  newRoomGameOverButton: document.querySelector("#newRoomGameOverButton"),
  shareScoreButton: document.querySelector("#shareScoreButton"),
};

const audio = new Chiptune();
const keysDown = new Set();
let socket = null;
let playerId = null;
let selectedTowerType = "arrow";
let selectedTowerId = null;
let latestState = null;
let sceneRef = null;
let lastGatherSent = 0;
let lastSnapshot = null;
let lastPingSent = 0;
let isPaused = false;
let gameStats = {
  wavesSurvived: 0,
  enemiesDefeated: 0,
  towersBuild: 0,
  resourcesGathered: 0,
};
const requestedRoom = getRoomFromUrl();

createTowerButtons();
setupSettingsUI();
connect();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  width: WORLD.width,
  height: WORLD.height,
  pixelArt: true,
  backgroundColor: "#141820",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    class HordeScene extends Phaser.Scene {
      constructor() {
        super("HordeScene");
        this.entityMaps = {};
      }

      create() {
        sceneRef = this;
        createTextures(this);
        this.drawTerrain();
        this.rangeGraphics = this.add.graphics().setDepth(8);
        this.shotGraphics = this.add.graphics().setDepth(7);
        this.weatherGraphics = this.add.graphics().setDepth(10);
        this.pointerGraphics = this.add.graphics().setDepth(9);
        this.uiGraphics = this.add.graphics().setDepth(11);
        this.floaters = new Map();
        this.input.on("pointerdown", (pointer) => this.handlePointer(pointer));
        if (latestState) this.renderSnapshot(latestState);
      }

      drawTerrain() {
        for (let y = 0; y < WORLD.height / WORLD.tile; y += 1) {
          for (let x = 0; x < WORLD.width / WORLD.tile; x += 1) {
            const isTrail = (x >= 5 && Math.abs(y - 9) <= 1) || (x > 20 && (y === 5 || y === 13));
            const key = isTrail ? "tile_dirt" : (x + y * 3) % 11 === 0 ? "tile_flowers" : "tile_grass";
            this.add.image(x * 32 + 16, y * 32 + 16, key).setScale(2).setDepth(0);
          }
        }

        const grid = this.add.graphics().setDepth(1);
        grid.lineStyle(1, 0x141820, 0.16);
        for (let x = 0; x <= WORLD.width; x += WORLD.tile) grid.lineBetween(x, 0, x, WORLD.height);
        for (let y = 0; y <= WORLD.height; y += WORLD.tile) grid.lineBetween(0, y, WORLD.width, y);
      }

      handlePointer(pointer) {
        if (!latestState || latestState.gameOver) return;
        const worldPoint = pointer.positionToCamera(this.cameras.main);
        const node = findResourceAt(worldPoint.x, worldPoint.y);
        if (node) {
          send({ type: "interact", targetId: node.id });
          audio.blip("gather");
          return;
        }
        const tower = findTowerAt(worldPoint.x, worldPoint.y);
        if (tower) {
          selectedTowerId = tower.id;
          updateHud(latestState);
          return;
        }
        selectedTowerId = null;
        send({ type: "build", towerType: selectedTowerType, x: worldPoint.x, y: worldPoint.y });
      }

      update() {
        this.drawPointer();
        this.updateFloatingText();
      }

      drawPointer() {
        this.pointerGraphics.clear();
        if (this.hoverLabel) this.hoverLabel.setVisible(false);
        if (!latestState || latestState.gameOver || !this.input.activePointer) return;

        const point = this.input.activePointer.positionToCamera(this.cameras.main);
        const x = Math.floor(point.x / WORLD.tile) * WORLD.tile + WORLD.tile / 2;
        const y = Math.floor(point.y / WORLD.tile) * WORLD.tile + WORLD.tile / 2;
        const node = findResourceAt(point.x, point.y);
        const def = latestState.towerDefs?.[selectedTowerType];
        const canPay = def ? canAfford(def.cost, latestState.resources) : false;
        const blocked = findTowerAt(point.x, point.y);
        const color = node || (canPay && !blocked) ? 0xa7d56e : 0xe56b3f;

        if (node) {
          this.pointerGraphics.lineStyle(2, 0xd9b45f, 0.8);
          this.pointerGraphics.strokeCircle(node.x, node.y, 24);
          this.pointerGraphics.fillStyle(0x141820, 0.82);
          this.pointerGraphics.fillRoundedRect(node.x - 42, node.y - 47, 84, 18, 3);
          const label = node.type === "wood" ? "Chop tree" : node.type === "food" ? "Pick food" : "Mine stone";
          drawBitmapLabel(this, label, node.x, node.y - 38, "hoverLabel");
          return;
        }

        this.pointerGraphics.lineStyle(2, color, 0.65);
        this.pointerGraphics.strokeRect(x - 16, y - 16, 32, 32);
        if (def?.range) {
          this.pointerGraphics.lineStyle(1, color, 0.24);
          this.pointerGraphics.strokeCircle(x, y, def.range);
        }
      }

      renderSnapshot(snapshot) {
        this.renderResources(snapshot.nodes);
        this.renderBase(snapshot.base);
        this.renderTowers(snapshot.towers);
        this.renderEnemies(snapshot.enemies);
        this.renderPlayers(snapshot.players);
        this.renderShots(snapshot.shots);
        this.renderWeather(snapshot);
        this.renderNearbyPrompt(snapshot);
      }

      renderBase(base) {
        if (!this.baseSprite) {
          this.baseShadow = this.add.ellipse(base.x, base.y + 28, 96, 30, 0x141820, 0.34).setDepth(2);
          this.baseSprite = this.add.image(base.x, base.y, "base").setScale(2).setDepth(3);
          this.baseFlag = this.add.rectangle(base.x + 30, base.y - 44, 10, 18, 0xb83b3b, 1).setDepth(4);
        }
        this.baseShadow.setPosition(base.x, base.y + 28);
        this.baseSprite.setPosition(base.x, base.y);
        this.baseFlag.setPosition(base.x + 30 + Math.sin(performance.now() / 180) * 2, base.y - 44);
        this.baseSprite.setTint(base.hp / base.maxHp < 0.35 ? 0xffbbbb : 0xffffff);
      }

      renderResources(nodes) {
        syncMap(
          this,
          "nodes",
          nodes,
          (node) => {
            const container = this.add.container(node.x, node.y).setDepth(2);
            const shadow = this.add.ellipse(0, 15, 34, 11, 0x141820, 0.28);
            const sprite = this.add.image(0, 0, `resource_${node.type}`).setScale(2);
            const back = this.add.rectangle(0, 23, 26, 4, 0x141820, 0.72);
            const fill = this.add.rectangle(-13, 23, 26, 4, 0xa7d56e, 0.86).setOrigin(0, 0.5);
            container.add([shadow, sprite, back, fill]);
            return { container, sprite, fill };
          },
          (entry, node) => {
            const bob = node.type === "food" ? Math.sin(performance.now() / 260 + node.id.length) * 1.4 : 0;
            const shake = node.hitFlash > 0 ? Math.sin(performance.now() / 28) * 3 : 0;
            entry.container.setPosition(node.x + shake, node.y + bob);
            entry.sprite.setAlpha(node.amount <= 0 ? 0.28 : 0.68 + 0.32 * (node.amount / node.max));
            entry.sprite.setScale(node.hitFlash > 0 ? 2.15 : 2);
            entry.sprite.setTint(node.hitFlash > 0 ? 0xfff0c0 : 0xffffff);
            entry.fill.width = Math.max(1, 26 * (node.amount / node.max));
            entry.fill.fillColor = node.type === "wood" ? 0xa7d56e : node.type === "stone" ? 0x87919e : 0xe56b3f;
          },
        );
      }

      renderTowers(towers) {
        syncMap(
          this,
          "towers",
          towers,
          (tower) => {
            const container = this.add.container(tower.x, tower.y).setDepth(5);
            const shadow = this.add.ellipse(0, 14, 34, 10, 0x141820, 0.3);
            const sprite = this.add.image(0, 0, `tower_${tower.type}`).setScale(2);
            const level = this.add
              .text(9, 7, `${tower.level}`, {
                fontFamily: "monospace",
                fontSize: "10px",
                color: "#e7e0c2",
                stroke: "#141820",
                strokeThickness: 3,
              })
              .setOrigin(0.5);
            container.add([shadow, sprite, level]);
            return { container, sprite, level };
          },
          (entry, tower) => {
            entry.container.setPosition(tower.x, tower.y);
            entry.level.setText(`${tower.level}`);
            entry.sprite.setAlpha(tower.type === "garden" ? 0.95 : 1);
            entry.sprite.rotation = tower.type === "frost" ? Math.sin(performance.now() / 300) * 0.05 : 0;
            entry.sprite.y = tower.type === "garden" ? Math.sin(performance.now() / 340 + tower.level) * 1 : 0;
          },
        );

        this.rangeGraphics.clear();
        const selected = towers.find((tower) => tower.id === selectedTowerId);
        if (selected) {
          const def = latestState?.towerDefs?.[selected.type];
          const range = def?.range ? def.range * (1 + (selected.level - 1) * 0.09) : 76 + selected.level * 10;
          this.rangeGraphics.lineStyle(2, 0x77c6d8, 0.44);
          this.rangeGraphics.strokeCircle(selected.x, selected.y, range);
          this.rangeGraphics.lineStyle(2, 0xd9b45f, 0.8);
          this.rangeGraphics.strokeRect(selected.x - 17, selected.y - 17, 34, 34);
        }
      }

      renderEnemies(enemies) {
        syncMap(
          this,
          "enemies",
          enemies,
          (enemy) => {
            const container = this.add.container(enemy.x, enemy.y).setDepth(6);
            const shadow = this.add.ellipse(0, 15, 28, 10, 0x141820, 0.28);
            const sprite = this.add.image(0, 0, `enemy_${enemy.type}`).setScale(2);
            const back = this.add.rectangle(0, -21, 28, 4, 0x141820, 0.85);
            const fill = this.add.rectangle(-14, -21, 28, 4, 0xe56b3f, 0.92).setOrigin(0, 0.5);
            container.add([shadow, sprite, back, fill]);
            return { container, sprite, fill };
          },
          (entry, enemy) => {
            entry.container.setPosition(enemy.x, enemy.y);
            entry.fill.width = Math.max(1, 28 * (enemy.hp / enemy.maxHp));
            entry.sprite.setAlpha(enemy.slowTimer > 0 ? 0.72 : 1);
            entry.sprite.setTint(enemy.hurtFlash > 0 ? 0xffffff : enemy.slowTimer > 0 ? 0x99ddff : 0xffffff);
            const stride = Math.sin(performance.now() / (enemy.type === "runner" ? 80 : 130) + enemy.x * 0.02);
            entry.sprite.y = stride * 1.6;
            entry.sprite.scaleX = 2 + stride * 0.035;
            entry.sprite.scaleY = 2 - stride * 0.035;
          },
        );
      }

      renderPlayers(players) {
        syncMap(
          this,
          "players",
          players,
          (player) => {
            const container = this.add.container(player.x, player.y).setDepth(6);
            const shadow = this.add.ellipse(0, 16, 26, 9, 0x141820, 0.28);
            const marker = this.add.ellipse(0, 18, 22, 6, Phaser.Display.Color.HexStringToColor(player.color).color, 0.72);
            const sprite = this.add.image(0, 0, "player").setScale(2);
            const action = this.add
              .text(0, -40, "", {
                fontFamily: "monospace",
                fontSize: "10px",
                color: "#d9b45f",
                stroke: "#141820",
                strokeThickness: 3,
              })
              .setOrigin(0.5);
            const label = this.add
              .text(0, -27, player.name, {
                fontFamily: "monospace",
                fontSize: "10px",
                color: "#e7e0c2",
                stroke: "#141820",
                strokeThickness: 3,
              })
              .setOrigin(0.5);
            container.add([shadow, marker, sprite, action, label]);
            return { container, sprite, action, label, lastX: player.x, lastY: player.y };
          },
          (entry, player) => {
            const moving = Math.hypot(player.x - entry.lastX, player.y - entry.lastY) > 0.5;
            entry.container.x = Phaser.Math.Linear(entry.container.x, player.x, 0.58);
            entry.container.y = Phaser.Math.Linear(entry.container.y, player.y, 0.58);
            const step = moving ? Math.sin(performance.now() / 82) : 0;
            entry.sprite.y = step * 1.6;
            entry.sprite.scaleX = 2 + Math.abs(step) * 0.035;
            entry.sprite.scaleY = 2 - Math.abs(step) * 0.035;
            entry.action.setText(player.action?.label || "");
            entry.label.setText(player.id === playerId ? "You" : player.name);
            entry.lastX = player.x;
            entry.lastY = player.y;
          },
        );
      }

      renderShots(shots) {
        this.shotGraphics.clear();
        shots.forEach((shot) => {
          const color = shot.type === "frost" ? 0x77c6d8 : shot.type === "cannon" ? 0xe56b3f : 0xd9b45f;
          this.shotGraphics.lineStyle(3, color, Math.min(1, shot.ttl * 4.6));
          this.shotGraphics.lineBetween(shot.x, shot.y, shot.tx, shot.ty);
          this.shotGraphics.fillStyle(color, 0.78);
          this.shotGraphics.fillCircle(shot.tx, shot.ty, shot.type === "cannon" ? 5 : 3);
        });
      }

      renderWeather(snapshot) {
        this.weatherGraphics.clear();
        if (snapshot.isNight) {
          this.weatherGraphics.fillStyle(0x20243a, 0.28);
          this.weatherGraphics.fillRect(0, 0, WORLD.width, WORLD.height);
        }
        if (snapshot.weather === "fog") {
          this.weatherGraphics.fillStyle(0xe7e0c2, 0.12);
          for (let y = 32; y < WORLD.height; y += 72) this.weatherGraphics.fillRect(0, y, WORLD.width, 22);
        }
        if (snapshot.weather === "rain" || snapshot.weather === "storm") {
          this.weatherGraphics.lineStyle(1, 0x77c6d8, snapshot.weather === "storm" ? 0.45 : 0.3);
          const offset = (performance.now() / 24) % 28;
          for (let x = -40; x < WORLD.width; x += 30) {
            this.weatherGraphics.lineBetween(x + offset, 0, x + offset - 18, WORLD.height);
          }
        }
        if (snapshot.weather === "storm" && Math.sin(performance.now() / 180) > 0.96) {
          this.weatherGraphics.fillStyle(0xe7e0c2, 0.18);
          this.weatherGraphics.fillRect(0, 0, WORLD.width, WORLD.height);
        }
      }

      renderNearbyPrompt(snapshot) {
        this.uiGraphics.clear();
        if (this.promptLabel) this.promptLabel.setVisible(false);
        const me = snapshot.players.find((player) => player.id === playerId);
        const node = me ? findNearestResource(me, snapshot.nodes, 58) : null;
        if (!node) return;

        this.uiGraphics.lineStyle(2, 0xd9b45f, 0.75);
        this.uiGraphics.strokeCircle(node.x, node.y, 25);
        this.uiGraphics.fillStyle(0x141820, 0.84);
        this.uiGraphics.fillRoundedRect(node.x - 54, node.y - 54, 108, 20, 3);
        const label = node.type === "wood" ? "Tap or E: chop" : node.type === "food" ? "Tap or E: pick" : "Tap or E: mine";
        drawBitmapLabel(this, label, node.x, node.y - 44, "promptLabel");
      }

      consumeEvents(events) {
        events.forEach((event) => {
          const text = this.add
            .text(event.x, event.y, event.text, {
              fontFamily: "monospace",
              fontSize: "13px",
              color: event.type === "deny" || event.type === "damage" ? "#e56b3f" : "#d9b45f",
              stroke: "#141820",
              strokeThickness: 4,
            })
            .setOrigin(0.5)
            .setDepth(12);
          this.floaters.set(event.id, { text, created: performance.now(), ttl: 900 });
        });
      }

      updateFloatingText() {
        this.floaters.forEach((entry, id) => {
          const age = performance.now() - entry.created;
          const pct = age / entry.ttl;
          entry.text.y -= 0.28;
          entry.text.setAlpha(1 - pct);
          if (pct >= 1) {
            entry.text.destroy();
            this.floaters.delete(id);
          }
        });
      }
    },
  ],
});

window.addEventListener("keydown", (event) => {
  keysDown.add(event.code);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if (event.code === "Escape") {
    togglePause();
    event.preventDefault();
  }
  if (event.code === "Digit1") selectTower("arrow");
  if (event.code === "Digit2") selectTower("cannon");
  if (event.code === "Digit3") selectTower("frost");
  if (event.code === "Digit4") selectTower("garden");
  if (event.code === "KeyU") upgradeSelected();
  if (event.code === "KeyR") repairBase();
});

window.addEventListener("keyup", (event) => keysDown.delete(event.code));

window.setInterval(() => {
  sendMovement();
  if (performance.now() - lastPingSent > 3000) {
    lastPingSent = performance.now();
    send({ type: "ping" });
  }
  if ((keysDown.has("KeyE") || keysDown.has("Space")) && performance.now() - lastGatherSent > 210) {
    lastGatherSent = performance.now();
    const me = latestState?.players.find((player) => player.id === playerId);
    const node = me ? findNearestResource(me, latestState.nodes, 58) : null;
    send({ type: "interact", targetId: node?.id });
  }
}, 50);

dom.upgrade.addEventListener("click", upgradeSelected);
dom.repair.addEventListener("click", repairBase);
dom.restart.addEventListener("click", () => send({ type: "restart" }));
dom.invite.addEventListener("click", copyInviteLink);
dom.newRoom.addEventListener("click", createNewRoom);
dom.sound.addEventListener("click", () => {
  const enabled = audio.toggle();
  dom.sound.textContent = enabled ? "Sound On" : "Sound Off";
});

function createTowerButtons() {
  Object.entries(TOWER_UI).forEach(([type, tower], index) => {
    const button = document.createElement("button");
    button.className = `tower-button${type === selectedTowerType ? " active" : ""}`;
    button.type = "button";
    button.dataset.type = type;
    button.innerHTML = `
      <canvas width="32" height="32" aria-hidden="true"></canvas>
      <span>${tower.label}</span>
      <small>${formatCost(tower.cost)}</small>
      <kbd>${index + 1}</kbd>
    `;
    button.addEventListener("click", () => selectTower(type));
    dom.towerButtons.appendChild(button);
    drawPreview(button.querySelector("canvas"), tower.key);
  });
}

function setupSettingsUI() {
  if (!dom.volumeSlider) return;

  // Volume control
  dom.volumeSlider.addEventListener("change", (e) => {
    const volume = e.target.value;
    dom.volumeValue.textContent = volume + "%";
    audio.setVolume(volume / 100);
    localStorage.setItem("gameVolume", volume);
  });

  // Load saved settings
  const savedVolume = localStorage.getItem("gameVolume");
  if (savedVolume) {
    dom.volumeSlider.value = savedVolume;
    dom.volumeValue.textContent = savedVolume + "%";
    audio.setVolume(savedVolume / 100);
  }

  // Graphics quality
  dom.graphicsSelect.addEventListener("change", (e) => {
    localStorage.setItem("graphicsQuality", e.target.value);
  });

  // Toggle settings
  dom.screenShakeToggle.addEventListener("change", (e) => {
    localStorage.setItem("screenShake", e.target.checked);
  });

  dom.particlesToggle.addEventListener("change", (e) => {
    localStorage.setItem("particles", e.target.checked);
  });

  // Load saved toggles
  dom.screenShakeToggle.checked = localStorage.getItem("screenShake") !== "false";
  dom.particlesToggle.checked = localStorage.getItem("particles") !== "false";

  // Modal controls
  // Settings button in side panel
  const settingsBtn = document.createElement("button");
  settingsBtn.className = "action-button";
  settingsBtn.textContent = "Settings";
  settingsBtn.addEventListener("click", () => {
    dom.settingsModal.removeAttribute("hidden");
  });
  dom.towerButtons.parentElement.insertBefore(settingsBtn, dom.upgrade);

  // Controls button in side panel
  const controlsBtn = document.createElement("button");
  controlsBtn.className = "action-button";
  controlsBtn.textContent = "Controls";
  controlsBtn.addEventListener("click", () => {
    dom.controlsModal.removeAttribute("hidden");
  });
  dom.towerButtons.parentElement.insertBefore(controlsBtn, dom.upgrade);

  // Close buttons
  dom.closeSettings.addEventListener("click", () => {
    dom.settingsModal.setAttribute("hidden", "");
  });

  dom.closeControls.addEventListener("click", () => {
    dom.controlsModal.setAttribute("hidden", "");
  });

  // Click outside modal to close
  dom.settingsModal.addEventListener("click", (e) => {
    if (e.target === dom.settingsModal) {
      dom.settingsModal.setAttribute("hidden", "");
    }
  });

  dom.controlsModal.addEventListener("click", (e) => {
    if (e.target === dom.controlsModal) {
      dom.controlsModal.setAttribute("hidden", "");
    }
  });

  // Pause button
  dom.pause.addEventListener("click", togglePause);

  // Resume button
  dom.resumeButton.addEventListener("click", togglePause);

  // Game over buttons
  dom.retryButton.addEventListener("click", () => {
    send({ type: "restart" });
    dom.gameOverModal.setAttribute("hidden", "");
    isPaused = false;
    gameStats = { wavesSurvived: 0, enemiesDefeated: 0, towersBuild: 0, resourcesGathered: 0 };
  });

  dom.newRoomGameOverButton.addEventListener("click", () => {
    window.location.href = "/";
  });

  dom.shareScoreButton.addEventListener("click", () => {
    const score = latestState?.score || 0;
    const waves = gameStats.wavesSurvived;
    const text = `I survived ${waves} waves with a score of ${score} in Survive the Horde!`;
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: "Survive the Horde", text, url });
    } else {
      // Fallback: copy to clipboard
      const shareUrl = `${text}\n${url}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        alert("Score copied to clipboard!");
      });
    }
  });

  // Click outside modal to close (but not pause modal)
  dom.gameOverModal.addEventListener("click", (e) => {
    if (e.target === dom.gameOverModal) {
      // Don't allow closing game over modal by clicking outside
    }
  });
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const port = location.port === "5173" ? "3000" : location.port;
  const roomQuery = requestedRoom ? `?room=${encodeURIComponent(requestedRoom)}` : "";
  const url = `${protocol}//${location.hostname}${port ? `:${port}` : ""}${roomQuery}`;
  socket = new WebSocket(url);

  socket.addEventListener("open", () => {
    const name = localStorage.getItem("hordeName") || `Scout ${Math.floor(Math.random() * 90 + 10)}`;
    localStorage.setItem("hordeName", name);
    send({ type: "hello", name, roomId: requestedRoom });
    dom.status.textContent = "Connected";
    dom.loadingText.textContent = `Joining ${requestedRoom || "meadow"}...`;
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "welcome") {
      playerId = message.playerId;
      dom.roomState.textContent = `room ${message.roomId || "meadow"}`;
      return;
    }
    if (message.type === "state") {
      latestState = message.state;
      updateHud(latestState);
      maybePlayAudio(lastSnapshot, latestState);
      lastSnapshot = latestState;
      if (sceneRef) {
        sceneRef.renderSnapshot(latestState);
        if (message.events?.length) sceneRef.consumeEvents(message.events);
      }
      dom.loading.classList.add("hidden");
    }
  });

  socket.addEventListener("close", () => {
    dom.status.textContent = "Disconnected. Reconnecting...";
    dom.loading.classList.remove("hidden");
    dom.loadingText.textContent = "Reconnecting...";
    window.setTimeout(connect, 1200);
  });
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sendMovement() {
  let x = 0;
  let y = 0;
  if (keysDown.has("KeyA") || keysDown.has("ArrowLeft")) x -= 1;
  if (keysDown.has("KeyD") || keysDown.has("ArrowRight")) x += 1;
  if (keysDown.has("KeyW") || keysDown.has("ArrowUp")) y -= 1;
  if (keysDown.has("KeyS") || keysDown.has("ArrowDown")) y += 1;
  send({ type: "input", x, y });
}

function updateHud(snapshot) {
  // Check if game is over and show game over screen
  if (snapshot.gameOver && !dom.gameOverModal.hasAttribute("hidden")) {
    // Already showing game over screen
  } else if (snapshot.gameOver && dom.gameOverModal.hasAttribute("hidden")) {
    showGameOver();
  }

  dom.wood.textContent = Math.floor(snapshot.resources.wood);
  dom.stone.textContent = Math.floor(snapshot.resources.stone);
  dom.food.textContent = Math.floor(snapshot.resources.food);
  dom.crystal.textContent = Math.floor(snapshot.resources.crystal || 0);
  dom.baseHp.textContent = `${Math.ceil(snapshot.base.hp)}/${snapshot.base.maxHp}`;
  dom.baseBar.style.width = `${Math.max(0, (snapshot.base.hp / snapshot.base.maxHp) * 100)}%`;
  dom.wave.textContent = snapshot.wave;
  dom.worldState.textContent = `${snapshot.isNight ? "Night" : "Day"} / ${capitalize(snapshot.weather)}`;
  dom.playerCount.textContent = snapshot.playerCount || snapshot.players.length;
  dom.roomState.textContent = `room ${snapshot.roomId || "meadow"}`;
  dom.techTier.textContent = snapshot.techTier || 1;
  dom.supplyState.textContent = `${Math.max(0, Math.ceil(snapshot.nextSupplyIn || 0))}s supply`;
  dom.status.textContent = snapshot.gameOver ? "Base destroyed" : snapshot.message;
  dom.upgrade.disabled = !selectedTowerId;

  const me = snapshot.players.find((player) => player.id === playerId);
  const node = me ? findNearestResource(me, snapshot.nodes, 58) : null;
  if (node) {
    dom.interactionToast.hidden = false;
    dom.interactionTitle.textContent = node.type === "wood" ? "Chop Tree" : node.type === "food" ? "Pick Food" : "Mine Stone";
    dom.interactionText.textContent = "Tap it, or press E / Space";
  } else {
    dom.interactionToast.hidden = true;
  }

  document.querySelectorAll(".tower-button").forEach((button) => {
    const type = button.dataset.type;
    const unlocked = snapshot.unlockedTowers?.includes(type) ?? (TOWER_UI[type].tier <= (snapshot.techTier || 1));
    button.classList.toggle("active", type === selectedTowerType);
    button.classList.toggle("locked", !unlocked);
    button.disabled = !unlocked || !canAfford(TOWER_UI[type].cost, snapshot.resources);
  });
}

function selectTower(type) {
  selectedTowerType = type;
  selectedTowerId = null;
  document.querySelectorAll(".tower-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.type === type);
  });
}

function upgradeSelected() {
  if (selectedTowerId) {
    send({ type: "upgrade", towerId: selectedTowerId });
    audio.blip("build");
  }
}

function repairBase() {
  send({ type: "repair" });
  audio.blip("repair");
}

function createTextures(scene) {
  Object.entries(PIXEL_ATLAS).forEach(([key, asset]) => {
    const rows = asset.rows;
    const width = rows[0].length;
    const height = rows.length;
    const texture = scene.textures.createCanvas(key, width, height);
    const context = texture.getContext();
    context.clearRect(0, 0, width, height);
    rows.forEach((row, y) => {
      [...row].forEach((char, x) => {
        const color = PALETTE[char];
        if (!color || color === "transparent") return;
        context.fillStyle = color;
        context.fillRect(x, y, 1, 1);
      });
    });
    texture.refresh();
  });
}

function drawPreview(canvas, key) {
  const rows = (PIXEL_ATLAS[key] || PIXEL_ATLAS.tower_arrow).rows;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  const pixel = Math.floor(canvas.width / rows[0].length);
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      const color = PALETTE[char];
      if (!color || color === "transparent") return;
      context.fillStyle = color;
      context.fillRect(x * pixel, y * pixel, pixel, pixel);
    });
  });
}

function syncMap(scene, name, items, createEntry, updateEntry) {
  if (!scene.entityMaps[name]) scene.entityMaps[name] = new Map();
  const map = scene.entityMaps[name];
  const ids = new Set(items.map((item) => item.id));

  items.forEach((item) => {
    if (!map.has(item.id)) map.set(item.id, createEntry(item));
    updateEntry(map.get(item.id), item);
  });

  [...map.entries()].forEach(([id, entry]) => {
    if (ids.has(id)) return;
    if (entry.container) entry.container.destroy(true);
    else if (entry.sprite) entry.sprite.destroy();
    map.delete(id);
  });
}

function findTowerAt(x, y) {
  return latestState?.towers.find((tower) => Math.hypot(tower.x - x, tower.y - y) < 22);
}

function findResourceAt(x, y) {
  return latestState?.nodes.find((node) => node.amount > 0 && Math.hypot(node.x - x, node.y - y) < 26);
}

function findNearestResource(player, nodes, maxDistance) {
  let best = null;
  let bestDistance = maxDistance;
  nodes
    .filter((node) => node.amount > 0)
    .forEach((node) => {
      const current = Math.hypot(node.x - player.x, node.y - player.y);
      if (current <= bestDistance) {
        best = node;
        bestDistance = current;
      }
    });
  return best;
}

function canAfford(cost, resources) {
  return Object.entries(cost).every(([key, amount]) => (resources?.[key] || 0) >= amount);
}

function togglePause() {
  isPaused = !isPaused;
  if (isPaused) {
    dom.pauseModal.removeAttribute("hidden");
    dom.pause.textContent = "⏯ Resume";
    send({ type: "pause" });
  } else {
    dom.pauseModal.setAttribute("hidden", "");
    dom.pause.textContent = "⏸ Pause";
    send({ type: "resume" });
  }
}

function showGameOver() {
  dom.gameOverModal.removeAttribute("hidden");
  dom.pause.setAttribute("disabled", "true");
  dom.pause.textContent = "⏸ Pause";
  
  // Update stats display
  if (latestState) {
    const score = latestState.score || 0;
    const wave = latestState.wave || 0;
    const enemies = latestState.enemies?.length || 0;
    const towers = latestState.towers?.length || 0;
    const resources = (latestState.resources?.wood || 0) + 
                     (latestState.resources?.stone || 0) + 
                     (latestState.resources?.food || 0) +
                     (latestState.resources?.crystal || 0);
    
    dom.statsWaves.textContent = wave;
    dom.statsEnemies.textContent = enemies;
    dom.statsTowers.textContent = towers;
    dom.statsResources.textContent = resources;
    dom.statsScore.textContent = score;
    
    gameStats.wavesSurvived = wave;
    gameStats.enemiesDefeated = enemies;
    gameStats.towersBuild = towers;
    gameStats.resourcesGathered = resources;
  }
}

function formatCost(cost) {
  return Object.entries(cost)
    .map(([key, value]) => `${key === "crystal" ? "C" : key[0].toUpperCase()}${value}`)
    .join(" ");
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function maybePlayAudio(previous, current) {
  if (!previous) return;
  if (current.towers.length > previous.towers.length) audio.blip("build");
  if (current.shots.length > previous.shots.length) audio.blip("shoot");
  if (
    current.resources.wood + current.resources.stone + current.resources.food >
    previous.resources.wood + previous.resources.stone + previous.resources.food + 1
  ) {
    audio.blip("gather");
  }
  if (current.base.hp < previous.base.hp) audio.blip("warning");
}

function drawBitmapLabel(scene, text, x, y, key) {
  if (!scene[key]) {
    scene[key] = scene.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e7e0c2",
        stroke: "#141820",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(12);
  }
  scene[key].setText(text).setPosition(x, y).setVisible(true);
}


function getRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("room") || "meadow").replace(/[^\w-]/g, "").slice(0, 24) || "meadow";
}

async function copyInviteLink() {
  const roomId = latestState?.roomId || requestedRoom || "meadow";
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  try {
    await navigator.clipboard.writeText(url.toString());
    dom.status.textContent = "Invite link copied.";
  } catch {
    dom.status.textContent = url.toString();
  }
}

async function createNewRoom() {
  try {
    const response = await fetch("/api/rooms", { method: "POST" });
    const data = await response.json();
    window.location.href = data.path;
  } catch {
    const roomId = `room-${Math.random().toString(36).slice(2, 8)}`;
    window.location.href = `/?room=${roomId}`;
  }
}
