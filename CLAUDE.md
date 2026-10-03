# CLAUDE.md

## Project Overview

A continuation of [micropolisJS](https://github.com/graememcc/micropolisJS), Graeme McCutcheon's hand-written JavaScript/HTML5 port of Micropolis — the GPL release of the original 1989 SimCity. The game runs entirely in the browser: a 120×100 tile city, simulated in the page, drawn on a canvas, saved to `localStorage`.

This repository is Adam's private continuation. The aim is to grow it from a faithful single-player port into the foundation of a multiplayer city builder with a richer simulated world. The **Direction** section below is the source of truth for where the code is heading.

| Component   | Technology                                                            |
|-------------|-----------------------------------------------------------------------|
| Language    | JavaScript (legacy, ES5-style prototypes) and TypeScript (new code)   |
| Bundler     | webpack 5 + ts-loader, entry `src/micropolis.js`, output `dist/`      |
| UI          | jQuery-driven DOM windows in `index.html`; the map on a `<canvas>`    |
| Tests       | Jest + ts-jest, `test/*.ts`                                           |
| Persistence | JSON in `localStorage` (`src/storage.js`)                             |

## Direction

Work that pulls against this needs Adam's go before it starts.

1. **A deterministic, headless simulation.** The simulation runs in Node without a DOM, advances by explicit ticks rather than wall-clock time, and produces the same city from the same seed and the same sequence of player commands. Everything below builds on this.
2. **Server-authoritative multiplayer.** A server owns the simulation. Browsers send commands ("road from A to B", "set tax to 9%") and render the state the server sends back. A player edit is a command the simulation applies, never a direct write to the map from UI code.
3. **A modernised codebase.** Legacy JavaScript moves to TypeScript module by module, and the jQuery UI is replaced.
4. **Gameplay improvements on top of the original rules**, such as ships that sail to the seaport instead of wandering the channel at random.
5. **Longer horizon, not planned in detail:** a richer generated world (climate and weather driven by parameters, natural resources, choosing where to found a city), several cities linked by road and rail, individually simulated residents, and LLM-driven notable residents whose behaviour may later be distilled into a small model of our own.

### Open decisions

Ask before writing code that settles one of these; record the decision here when it is made.

- **Server language.** TypeScript on Node reuses the simulation as it stands; a C# port of the simulation fits Adam's backend stack.
- **Multiplayer shape.** One shared city run by several mayors, or neighbouring cities on one map. A shared city raises who controls the budget and taxes, and how pause and game speed work with more than one player.

## Git

- Default branch is `main`.
- `origin` is the private repository `AdamTovatt/micropolisJS`. `upstream` is `graememcc/micropolisJS`: fetch from it to pick up the original author's changes, never push to it.

## Commands

```bash
npm install
npm run dev              # webpack-dev-server on http://localhost:8080
npm run build            # production bundle into dist/
npm test                 # Jest
npx jest test/tile.ts    # one test file
```

Open the game with `?debug=1` in the URL for debug mode (`Config.debug`): an undefined event name throws instead of warning, the FPS counter shows, and the query tool reports raw tile data.

## Architecture

### Layers

- **Simulation** — DOM-free. `simulation.js` orchestrates; the subsystems are `mapScanner.js`, `residential.js`, `commercial.js`, `industrial.js`, `road.js`, `transport.js`, `powerManager.js`, `traffic.js`, `stadia.js`, `miscTiles.js`, `emergencyServices.js`, `valves.js` (residential/commercial/industrial demand), `census.js`, `budget.js`, `evaluation.js`, `disasterManager.js`, `blockMapUtils.js`.
- **Game and UI** — `game.js` owns the `Simulation`, the canvas, the tools and the windows (`*Window.js`). It runs two loops: `tick` (`setTimeout(0)`: input, then one simulation tick) and `animate` (`requestAnimationFrame`: sprite movement, then painting).
- **Rendering** — `gameCanvas.js` draws 16×16 tiles from `images/tiles.png` through `tileSet.js` (with a snow variant), and sprites from `images/sprites.png`. `monsterTV.js` is the small disaster-follow view.

### The simulation cycle

`Simulation.simTick()` → `_simFrame()` gates on the game speed → `simulate()` advances one phase of a 16-phase cycle:

| Phase | Work |
|-------|------|
| 0     | advance `_cityTime` and `_simCycle`, set the demand valves, clear the census |
| 1–8   | scan one eighth of the map's columns each, calling the tile handlers |
| 9     | census, tax collection and city evaluation at their frequencies |
| 10    | decay the rate-of-growth and traffic maps, send advisor messages |
| 11–15 | power scan; pollution, terrain and land value; crime; population density; fire coverage and disasters |

How often phases 11–15 run depends on the game speed (`speedPowerScan` and its siblings in `simulation.js`), so speed changes simulation results. It is simulation state, not a display setting.

### Tile handlers

Subsystems register handlers with `mapScanner.addAction(tileValueOrPredicate, handler)` from `registerHandlers`, all called in `Simulation.init`. During phases 1–8 the scanner calls the handler for every matching tile with `(map, x, y, simData)`; `simData` (from `_constructSimData`) carries the census, budget, block maps, sprite manager and the other managers.

### State

- `gameMap.js` holds the tile grid. `tile.ts` is a tile's value plus flags (`tileFlags.ts`: powered, conductive, burnable, bulldozable, zone centre…). `tileValues.ts` names every tile id (`RIVER`, `CHANNEL`, `PORT`…).
- `simulation.blockMaps` holds coarse overlays at block sizes 2, 4 or 8 (`blockMap.ts`): land value, pollution, crime, traffic density, population density, police and fire coverage, rate of growth. Each map's comment in the `Simulation` constructor states its range.
- Every stateful component has `save(saveData)` and `load(saveData)`. `storage.js` writes the combined object, versions it (`Storage.CURRENT_VERSION`) and migrates old saves (`transitionOldSave`). A change to saved state bumps the version and adds a migration step.

### Events

`eventEmitter.js` decorates a constructor or object with `addEventListener`, `removeEventListener` and `_emitEvent`. Event names live in `messages.ts`. Subsystems emit, `Simulation` re-emits upward, and the UI listens: the simulation never calls UI code.

### Sprites

`spriteManager.js` and the `*Sprite.js` files: train, ship, plane, helicopter, monster, tornado and explosion. Sprites move in the **render loop** (`commonAnimate` in `game.js` → `spriteManager.moveObjects`), not in the simulation tick, so their behaviour — including the map damage a crash, monster or tornado causes — runs at the display's frame rate.

### Tools

`*Tool.js` on top of `baseTool.js`; `gameTools.js` builds the set. A tool stages its edits in a `WorldEffects` (`worldEffects.js`), checks the funds, then writes the staged tiles to the map and charges the budget.

## Rules for simulation code

- **Deterministic.** Randomness comes only from `random.ts`; time comes only from the simulation's own counters (`_cityTime`, `_simCycle`, `_phaseCycle`). A `Math.random`, `Date` or `performance.now` read inside simulation code is a defect to fix, not a pattern to copy. UI code never draws from the simulation's random stream.
- **No DOM.** No `window`, `document` or jQuery in simulation modules.
- **Rule changes are deliberate.** The original's numbers are tuned against each other. A change to how the city behaves is named as such in its commit, never folded into a refactor.

## The original as reference

The original C/C++ source is the behavioural reference: <https://github.com/SimHacker/micropolis>, engine in `MicropolisCore/src/MicropolisEngine/src/`. This port follows it closely, function by function — for example `boatSprite.js` mirrors `doShipSprite` in `sprite.cpp`. When something behaves oddly, compare against the original before calling it a port bug: much odd behaviour is faithful to 1989, such as ships that wander the channel at random and wreck at dead ends.

## Code style

- New modules are TypeScript. Convert a legacy module whole, together with its tests, rather than mixing styles inside one file.
- Imports name the file extension (`./tile.ts`, `./game.js`); webpack's `extensionAlias` resolves both.
- `tsconfig.json` is strict, including `noUnusedLocals` and `noUnusedParameters`.
- Every source file keeps the GPL and Micropolis header comment at the top, new files included.

## License and naming

- The code is GPLv3 with EA's additional terms (`LICENSE`, `COPYING`). Any build served to players must come with its source under the same license.
- Modified versions must be marked as modified and not presented as the original program. Never use the SimCity trademark or claim affiliation with Electronic Arts.
- The name "Micropolis" is governed by `MicropolisPublicNameLicense.md`. Read it before any naming or branding decision.

## Hard Rules — Stop and Ask

If any of these arise, **stop immediately** and ask for guidance before continuing:

1. **Architectural dead-end**: the implementation cannot be solved cleanly. Explain the constraint and suggest clean alternatives.
2. **Hacky path**: mid-implementation you realise the approach involves workarounds or quality compromises. Discard it and propose the clean path. No sunk cost fallacy, no "just make it work for now".
3. **Against the direction**: the right implementation contradicts the Direction section or settles an Open decision. Raise it first; don't drift silently.
