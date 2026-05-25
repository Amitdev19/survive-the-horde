# Survive the Horde - Game Design Document

## Concept

Survive the Horde is a browser-based 2D pixel art tower defense survival game. Players share a single base, gather resources, craft defenses, upgrade towers, and survive increasingly dangerous enemy waves.

## Core Loop

1. Move around the map and gather wood, stone, and food from resource nodes.
2. Spend resources to build towers, gardens, upgrades, and base repairs.
3. Defend the base from enemy waves.
4. Adapt to night and weather modifiers.
5. Repeat with stronger waves and higher score pressure.

## Controls

- Move: WASD or arrow keys.
- Gather: click/tap a nearby resource, or press E/Space near it.
- Build: select a tower type, then click a valid tile.
- Upgrade: click a tower, then press U or use the upgrade button.
- Repair: press R or use the repair button.
- Multiplayer: open the same server URL in more browser tabs or devices on the same network.

## Towers

- Archer Tower: cheap wood tower, fast single-target shots.
- Cannon Tower: wood and stone tower with slower splash damage.
- Frost Tower: stone and food tower that slows priority enemies.
- Garden Plot: survival structure that produces food and slows nearby enemies.

## Enemies

- Grunt: balanced baseline enemy.
- Runner: low health but fast, especially dangerous at night.
- Brute: slow, durable enemy that deals heavy base damage.

## Survival Systems

- Shared resources are required for building, upgrading, and repairing.
- Resource nodes deplete and slowly regenerate.
- Gardens create food and lightly repair the base during daytime.
- Day-night cycle increases enemy speed and reduces tower visibility at night.
- Weather can apply tactical pressure:
  - Clear: no penalty.
  - Rain: towers fire a little slower.
  - Fog: tower range is reduced.
  - Storm: enemies are faster and players move slower.

## Multiplayer Model

The Node.js server is authoritative. It owns players, resources, enemies, towers, base health, waves, weather, combat, and target validation. Browser clients send movement and action requests; the server broadcasts shared room snapshots and short-lived gameplay events to all connected clients.

The current server supports a default `meadow` room and can move sessions into named rooms through the `hello` message. Each session gets a stable player id, heartbeat support, and server-side validation for gathering, building, upgrading, and repair actions.

## Art Direction

The prototype uses a 16-color pixel palette. Assets are AI-authored as small pixel matrices in `client/src/pixelAtlas.js`, then converted into Phaser textures in the browser. Most objects are 16x16 sprites scaled to 32px in game, with the base using a larger 32x32 sprite.

## Technical Stack

- Phaser 3 for the 2D browser game engine.
- Vite for bundling the client.
- HTML5, CSS3, and JavaScript.
- Node.js HTTP server for static hosting.
- `ws` WebSocket server for multiplayer.
- Procedural Web Audio chiptune sound effects and a simple music loop.

## Prototype Scope

This build is a playable vertical slice: one shared survival map, four buildable structures, three enemy types, endless waves, day-night/weather effects, shared multiplayer state, generated pixel art, procedural audio, loading/connection UI, click-to-gather prompts, floating feedback text, and lightweight sprite animation. Future production work could add account lobbies, more maps, authored sprite sheets, saving, accessibility options, and matchmaking.
