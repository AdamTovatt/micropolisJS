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

1. **A deterministic, headless simulation.** The simulation runs without a DOM (in Node, and in C# after the port), advances by explicit steps rather than wall-clock time, and produces the same city from the same seed and the same sequence of player commands. Everything below builds on this.
2. **Server-authoritative multiplayer on a C# server.** The server owns the simulation. Browsers send commands ("road from A to B", "set tax to 9%") and render the state the server sends back. A player edit is a command the simulation applies, never a direct write to the map from UI code. Every player has the same powers: any player can issue any command, and the simulation never branches on who sent one.
3. **The TypeScript simulation is the reference until the C# port replaces it.** Everything that changes or computes city state moves to C#: the simulation, sprite behaviour, map generation and the random stream, applying and validating commands, save and load. The port is correct when it reproduces the TypeScript simulation's state hash from the same seed, starting state and command log. Once it does, the TypeScript simulation is deleted and the C# code is the only home of the game rules. Command logs are both the end-to-end suite and the conformance suite: replayed headless and in the browser while the TypeScript simulation exists, and on the server after. Anything in the simulation that another language can't reproduce bit for bit is a defect.
4. **The browser is the client.** It draws tiles and sprites, animates tiles, captures input (tool choice, the hover box, turning drags into tile paths) and shows the windows. It changes city state only by sending commands. Map overlays and query-tool data come from the server on request.
5. **A modernised client.** Client code moves from JavaScript to TypeScript module by module, and the jQuery UI is replaced. Simulation modules are not converted: the C# port retires them.
6. **Gameplay improvements on top of the original rules**, such as ships that sail to the seaport instead of wandering the channel at random. They are built in the C# simulation after the port, so each rule is written once.
7. **Longer horizon, not planned in detail:** a richer generated world (climate and weather driven by parameters, natural resources, choosing where to found a city), several cities linked by road and rail, individually simulated residents, and LLM-driven notable residents whose behaviour may later be distilled into a small model of our own.

### Open decisions

Ask before writing code that settles one of these; record the decision here when it is made.

- **Multiplayer shape.** One shared city run by several mayors, or neighbouring cities on one map. Either way every player has the same powers; a shared city still has to settle how pause and game speed work with more than one player.

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
npm run lint             # ESLint over src/, test/, headless/ and the build config
npm run simulate -- --fixture town --steps 3000   # headless run: prints the state hash, year, population, funds
npm run fixtures         # export each fixture's saved state to headless/fixtures/export/ (ignored by git)
```

The headless runner takes `--seed <n>` (a generated map) or `--fixture <name>`, `--reseed <n>` to replace a fixture's stream, `--speed slow|medium|fast` to override the saved speed, and `--steps <n>`.

Node 24 or later (`engines` in `package.json`). CI (`.github/workflows/ci.yml`) runs `npm ci`, then build, test and lint, on Node 24 on every push and pull request.

Tests are TypeScript and can import the legacy JavaScript modules: ts-jest compiles both. The game's Settings window and the footers of the about and name-license pages show the build ID, `git rev-parse --short=12 HEAD`, or `unknown` outside a git checkout.

Open the game with `?debug=1` in the URL for debug mode (`Config.debug`): an undefined event name throws instead of warning, the FPS counter shows, and the query tool reports raw tile data.

## Architecture

### Layers

- **Simulation** — DOM-free. `simulation.js` orchestrates; the subsystems are `mapScanner.js`, `residential.js`, `commercial.js`, `industrial.js`, `road.js`, `transport.js`, `powerManager.js`, `traffic.js`, `stadia.js`, `miscTiles.js`, `emergencyServices.js`, `valves.js` (residential/commercial/industrial demand), `census.js`, `budget.js` (paying for services through `yearEndBudget.ts`), `evaluation.js`, `disasterManager.js`, `blockMapUtils.js`, `cityStatus.ts` (the advisor conditions and the city status record).
- **Game and UI** — `game.js` owns the `Simulation`, the canvas, the tools and the windows (`*Window.js`). It runs two loops: `tick` (`setTimeout(0)`: input, then the simulation steps due) and `animate` (`requestAnimationFrame`: painting). `stepDriver.ts` turns real time into steps at a fixed 60 per second. It catches up after a slow frame, up to a second's worth of steps at a time, and drops the rest of a longer gap. It owes nothing while the city is not stepping: paused, behind the budget window, in a hidden tab, or under the screen-too-small overlay. `windowManager.ts` shows the windows one at a time. A window showing holds the keyboard and mouse, but only the budget window holds the city. A year-end budget that falls due while another window shows opens when that window closes, and the simulation holds its phases until it has the player's values. Milestones are good-news notifications, not windows. `speedControl.ts` applies the speed the player sets with Pause, Play and Settings; the simulation's speed is the only record of whether the game is paused.
- **Headless** — `headless/` runs the simulation in Node through `tsx`, without a browser: `runner.ts` starts a city from a seed or a fixture and steps it, failing rather than stalling silently, and `cli.ts` is its command line. A fixture is a seed plus a build script in `headless/fixtures/` that drives the tool objects. The runner and the tests build a fixture from its script each time they use it, then load its saved state; no saved copy is committed. The state hash (`stateHash.ts`, specified in `docs/state-hash.md`) is SHA-256 over the canonical text of the saved state.
- **Rendering** — `gameCanvas.js` draws 16×16 tiles from `images/tiles.png` through `tileSet.js` (with a snow variant), and sprites from `images/sprites.png`. `animationManager.js` animates tiles from their value and the client's clock, and never writes the map: an explosion holds its last frame until the simulation's scan turns the tile to rubble. `monsterTV.js` is the small disaster-follow view.

### The simulation cycle

`Simulation.step()` is one loop, as `simLoop` in the original: `_simFrame()` gates on the game speed, then every sprite moves. The gate is the saved `_speedCycle` counter, which lets a phase through on every 5th step at slow speed, every 3rd at medium and every step at fast. A paused simulation's step does nothing. While the budget awaits the player's values (`budget.awaitingValues`), the gate lets no phase through and holds `_speedCycle`, but sprites keep moving. The step count, never wall time, advances the city. Each step that passes the gate runs `simulate()`, which advances one phase of a 16-phase cycle:

| Phase | Work |
|-------|------|
| 0     | advance `_cityTime` and `_simCycle`, set the demand valves, clear the census |
| 1–8   | scan one eighth of the map's columns each, calling the tile handlers |
| 9     | census, tax collection and city evaluation at their frequencies |
| 10    | decay the rate-of-growth and traffic maps, send advisor messages |
| 11–15 | power scan; pollution, terrain and land value; crime; population density; fire coverage and disasters, then publish the city status record |

How often phases 11–15 run depends on the game speed (`speedPowerScan` and its siblings in `simulation.js`), so speed changes simulation results. It is simulation state, not a display setting.

### Tile handlers

Subsystems register handlers with `mapScanner.addAction(tileValueOrPredicate, handler)` from `registerHandlers`, all called in `Simulation.init`. During phases 1–8 the scanner calls the handler for every matching tile with `(map, x, y, simData)`; `simData` (from `_constructSimData`) carries the census, budget, block maps, the random stream, the sprite manager and the other managers.

### State

- `gameMap.js` holds the tile grid. `tile.ts` is a tile's value plus flags (`tileFlags.ts`: powered, conductive, burnable, bulldozable, zone centre…). `tileValues.ts` names every tile id (`RIVER`, `CHANNEL`, `PORT`…).
- `simulation.blockMaps` holds coarse overlays at block sizes 2, 4 or 8 (`blockMap.ts`): land value, pollution, crime, traffic density, population density, police and fire coverage, rate of growth. Each map's comment in the `Simulation` constructor states its range.
- `simulation.random` is the simulation's random stream (`random.ts`), seeded from the game seed. The map generator draws from the same seed's map stream, so one seed reproduces map and city. The `random.ts` header specifies the stream, which the C# port reproduces bit for bit, and `test/random.ts` holds reference vectors computed by the reference C implementation.
- A stateful component's `save(saveData)` and `load(saveData)` write and read its fields under its own key of the save. What the scans derive is saved under `scannedState` instead, through `saveScan` and `loadScan`: the census has both pairs, and the power manager, which holds only scan results, has only the scan pair. `test/savedFields.ts` fails on a field a component holds but neither saves nor explains. A save holds the complete simulation state, the stream's included, so a loaded city continues exactly as it would have without the save; `docs/state-hash.md` lists every key, and a field the simulation adds is saved and listed there too. The `Simulation` constructor starts a new city from a seed, and `Simulation.fromSave` builds one from a save. `Simulation.load` restores a save over a city of the same map size, and nothing of the city it replaces survives. It restores without scanning, except for a browser save that `transitionOldSave` migrated from a version without the scanned state: that save's scanned state is `null`, so loading derives it by scanning from a new city's scanned state, then restores the rest of the save over whatever the scan changed. `storage.js` writes the combined object, versions it (`Storage.CURRENT_VERSION`) and migrates old saves (`transitionOldSave`). A change to saved state bumps the version, adds a migration step and updates the golden hashes in the same commit.

### Events

`eventEmitter.js` decorates a constructor or object with `addEventListener`, `removeEventListener` and `_emitEvent`. Event names live in `messages.ts`. Subsystems emit, `Simulation` re-emits upward, and the UI listens: the simulation never calls UI code.

A condition that holds over time (power load against capacity, a demand cap, an advisor warning) is state, published each cycle in the `CITY_STATUS_UPDATED` record that `statusPanel.ts` renders. A `FRONT_END_MESSAGE` notification announces a condition or a one-off event and then times out; the record is what shows a condition for as long as it holds. The record is built each cycle and not saved, but its sources are: the power figures from the last power scan, and the cap flags from the valves.

### Sprites

`spriteManager.js` and the `*Sprite.js` files: train, ship, plane, helicopter, monster, tornado and explosion. Sprites move once per simulation step (`Simulation.step` → `spriteManager.moveObjects`), at the same rate whatever the game speed, and draw from the simulation's stream, so their behaviour, including the map damage a crash, monster or tornado causes, is part of the deterministic simulation.

### Tools

`*Tool.js` on top of `baseTool.js`. `cityTools.ts` builds the tools that change the city, with their costs, for the browser and the headless fixtures alike; `gameTools.js` adds the query tool and re-emits its events. A tool stages its edits in a `WorldEffects` (`worldEffects.js`), checks the funds, then writes the staged tiles to the map and charges the budget.

## Rules for simulation code

- **Deterministic.** Randomness comes only from `random.ts`; time comes only from counters the simulation advances as it steps. A `Math.random`, `Date` or `performance.now` read inside simulation code is a defect to fix, not a pattern to copy. Only what changes city state draws from the simulation's stream, tools and disasters included; the UI's own randomness, such as picking a new seed, comes from `uiRandom.ts`.
- **No DOM.** No `window`, `document` or jQuery in simulation modules.
- **Simulation modules** are every file the simulation (`simulation.js`), the map generator (`mapGenerator.js`) or a map-editing tool (`cityTools.ts`, and every `*Tool.js` but the query tool) imports, directly or not. `test/simulationImports.ts` walks that graph with the TypeScript checker and fails on any global but a short list of pure built-ins, on any `Math` function outside the portable ones, and on `**`, a package import or a dynamic import.
- **Portable arithmetic.** No transcendental `Math` functions (`sqrt`, `pow`, `sin`, `log`…) in simulation code: their results can differ between runtimes. Arithmetic, `Math.floor` and `Math.round` are fine, provided the C# port mirrors JavaScript's `Math.round`, where halves round toward +∞ rather than to even. `Math.fround` is fine too: it rounds to the nearest IEEE single, as a C# `(float)` cast does. It reproduces the original's float arithmetic where a rule depends on it, provided every float operand and the result of each single `+`, `-`, `*` or `/` is wrapped in it: `Math.fround(Math.fround(a) * Math.fround(b))` is the float product, but `Math.fround(a * b + c)` is not the float sum of a float product.
- **Rule changes are deliberate.** The original's numbers are tuned against each other. A change to how the city behaves is named as such in its commit, never folded into a refactor. `test/goldenHashes.ts` pins each fixture's state hash as built and after a fixed run. A change to a fixture's script, to saved state or to a rule moves them, and that commit updates them; a refactor that moves one is a defect. A run hash that moves while the built hash holds is a change to how the city behaves.

## The original as reference

The original C/C++ source is the behavioural reference: <https://github.com/SimHacker/micropolis>, engine in `MicropolisCore/src/MicropolisEngine/src/`. This port follows it closely, function by function — for example `boatSprite.js` mirrors `doShipSprite` in `sprite.cpp`. When something behaves oddly, compare against the original before calling it a port bug: much odd behaviour is faithful to 1989, such as ships that wander the channel at random and wreck at dead ends.

## Code style

- New modules are TypeScript. Convert a legacy client module whole, together with its tests, rather than mixing styles inside one file. Legacy simulation modules are not converted, since the C# port retires them.
- JavaScript modules name the file extension in their imports (`./tile.ts`, `./game.js`); webpack's `extensionAlias` resolves both. TypeScript modules import TypeScript files without an extension (`./tile`), because `tsconfig.json` rejects a `.ts` suffix, and name it for JavaScript files (`./text.js`).
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
