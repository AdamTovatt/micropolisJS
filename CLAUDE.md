# CLAUDE.md

## Project Overview

A continuation of [micropolisJS](https://github.com/graememcc/micropolisJS), Graeme McCutcheon's hand-written JavaScript/HTML5 port of Micropolis — the GPL release of the original 1989 SimCity. The game runs entirely in the browser: a 120×100 tile city, simulated in the page, drawn on a canvas, saved to `localStorage`.

This repository is Adam's private continuation. The aim is to grow it from a faithful single-player port into the foundation of a multiplayer city builder with a richer simulated world. The **Direction** section below is the source of truth for where the code is heading.

| Component   | Technology                                                                         |
|-------------|------------------------------------------------------------------------------------|
| Language    | JavaScript (legacy, ES5-style prototypes) and TypeScript (new code) in the browser; C# on .NET 10 for the server |
| Bundler     | webpack 5 + ts-loader, entry `src/micropolis.js`, output `dist/`                   |
| UI          | jQuery-driven DOM windows in `index.html`; the map on a `<canvas>`                 |
| Server      | ASP.NET Core on .NET 10, `server/Micropolis.slnx`; EasyReasy.Auth for tokens       |
| Tests       | Jest + ts-jest, `test/*.ts`; MSTest, one test project per C# project               |
| Persistence | JSON in `localStorage` (`src/storage.js`)                                          |

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

Ask before writing code that settles an open decision; record the decision under Decided when it is made.

#### Decided

- **Multiplayer shape.** One shared city, run in real time by several mayors, each with every power a single player has: any player can build, bulldoze, set taxes and the budget, trigger disasters, pause and change the speed. Pause and speed are commands like any other and apply to everyone. The simulation never branches on who sent a command.

## Git

- Default branch is `main`.
- `origin` is the private repository `AdamTovatt/micropolisJS`. `upstream` is `graememcc/micropolisJS`: fetch from it to pick up the original author's changes, never push to it.

## Commands

```bash
npm install
(cd server/Micropolis.Server && dotnet run)   # server and client together: open http://localhost:5180
npm run dev              # webpack-dev-server on http://localhost:8080, the client alone
npm run build            # production bundle into dist/
npm test                 # Jest
npx jest test/tile.ts    # one test file
npm run lint             # ESLint over src/, test/, headless/ and the build config
npm run simulate -- --fixture town --steps 3000   # headless run: prints the state hash, year, population, funds
npm run fixtures         # export each fixture's saved state to headless/fixtures/export/ (ignored by git)
dotnet build server/Micropolis.slnx   # the C# solution
dotnet test server/Micropolis.slnx    # MSTest
```

`dotnet run` in `server/Micropolis.Server` is the dev command, and `remote-claude.json` binds the dev-server button to it. The server listens on :5180, and SpaProxy starts `npm run dev` unless something already answers on :8080, then sends the browser there; whatever answers on :8080 is the client it uses. webpack-dev-server proxies `/api` and `/ws/city` to the server. The server will not start without two settings, which development takes from `Properties/launchSettings.json`: `JWT_SECRET`, at least 32 bytes, and `TRUSTED_PROXIES`, the addresses of the reverse proxies in front of the server, separated by commas, or `none`. Behind a proxy it does not trust, the server sees every player at the proxy's address, and they share one sign-in rate limit. `dotnet publish` runs `npm ci` in the repository root, which deletes and reinstalls `node_modules`, then `npm run build`, which overwrites `dist/`, and copies `dist/` into the published `wwwroot`, which the server serves.

The headless runner takes `--seed <n>` (a generated map) or `--fixture <name>`, `--reseed <n>` to replace a fixture's stream, `--speed slow|medium|fast` to override the saved speed, and `--steps <n>`.

Node 24 or later (`engines` in `package.json`), and the .NET 10 SDK for `server/`. CI (`.github/workflows/ci.yml`) runs on every push and pull request: one job runs `npm ci`, then build, test and lint, on Node 24, and another builds and tests the C# solution.

Tests are TypeScript and can import the legacy JavaScript modules: ts-jest compiles both. The game's Settings window and the footers of the about and name-license pages show the build ID, `git rev-parse --short=12 HEAD`, or `unknown` outside a git checkout.

Open the game with `?debug=1` in the URL for debug mode (`Config.debug`): an undefined event name throws instead of warning, the FPS counter shows, and the query tool reports raw tile data.

## Architecture

### Layers

- **Simulation** — DOM-free. `simulation.js` orchestrates; the subsystems are `mapScanner.js`, `residential.js`, `commercial.js`, `industrial.js`, `road.js`, `transport.js`, `powerManager.js`, `traffic.js`, `stadia.js`, `miscTiles.js`, `emergencyServices.js`, `valves.js` (residential/commercial/industrial demand), `census.js`, `budget.js` (funding services through `serviceFunding.ts`), `evaluation.js`, `disasterManager.js`, `blockMapUtils.js`, `cityStatus.ts` (the advisor conditions and the city status record). `commands.ts` is simulation code too: the commands and how they are validated, which the C# port reproduces.
- **Game and UI** — `game.js` owns the `Simulation`, the command queue, the canvas and the windows (`*Window.js`). It runs two loops: `tick` (`setTimeout(0)`: input, then the commands sent since the last tick, then the simulation steps due) and `animate` (`requestAnimationFrame`: painting). `stepDriver.ts` turns real time into steps at a fixed 60 per second. It catches up after a slow frame, up to a second's worth of steps at a time, and drops the rest of a longer gap. It owes nothing while the city is not stepping: paused, in a hidden tab, or under the screen-too-small overlay. `windowManager.ts` shows the windows one at a time. A window showing holds the keyboard and mouse; no window holds the city. The year-end budget never waits for the player (see `Budget.doBudgetNow`): with auto-budget off, or when auto-budget couldn't cover the services, the budget window opens as a review once no other window shows, and the player's changes there are a `setBudget` command. `windowCommands.ts` turns the windows' choices into commands. Milestones are good-news notifications, not windows. `speedControl.ts` applies the speed the player sets with Pause, Play and Settings; the simulation's speed is the only record of whether the game is paused.
- **Headless** — `headless/` runs the simulation in Node through `tsx`, without a browser: `runner.ts` starts a city from a seed or a fixture and steps it, failing rather than stalling silently, and `cli.ts` is its command line. A fixture is a seed plus a build script in `headless/fixtures/` that sends the simulation tool commands. The runner and the tests build a fixture from its script each time they use it, then load its saved state; no saved copy is committed. The state hash (`stateHash.ts`, specified in `docs/state-hash.md`) is SHA-256 over the canonical text of the saved state.
- **Rendering** — `gameCanvas.js` draws 16×16 tiles from `images/tiles.png` through `tileSet.js` (with a snow variant), and sprites from `images/sprites.png`. `animationManager.js` animates tiles from their value and the client's clock, and never writes the map: an explosion holds its last frame until the simulation's scan turns the tile to rubble. `monsterTV.js` is the small disaster-follow view.
- **Server** — `server/` is a .NET 10 solution, `Micropolis.slnx`, with a test project per project. `Micropolis.Rules` holds the game rules and the server's half of the protocol, and has no ASP.NET dependency, so a test or a tool can run them without a host. `Micropolis.Server` is the ASP.NET Core host. `POST /api/session` signs a player in with a display name only, a few times a minute per client address: the token's subject is a new player id, the name is the only claim the server adds, and it carries no roles, because no player can be denied anything. `GET /api/session` answers who a token belongs to, or 401, which is also how the browser finds out that a server answers. `/ws/city` is one plain WebSocket of JSON messages, where `PlayerPresence` lists who is online and each `CityConnection` is the one writer to its socket. The server closes a connection when its token expires.
- **Server connection (client)** — `cityClient.ts` signs in and holds the city's WebSocket, with no DOM, so its tests drive it through a fake browser; `browserCityEnvironment.ts` gives it the browser's fetch, WebSocket, storage and locks. With no server answering, the game starts single-player. Once online, it reconnects after a drop with growing delays, and signs in again under the stored name when the server rejects its token, one tab at a time, so tabs sharing a session stay one player. `signInForm.ts` asks for a name before the splash screen when a server answers and no session is stored, or the server refuses the stored name, and `onlineList.ts` shows who is online, or "Offline", over the top of the map.
- **Protocol** — `src/protocol.ts` and `server/Micropolis.Rules/Protocol.cs` define the bodies of `/api/session` and the WebSocket's messages by hand. `protocol/README.md` specifies the wire format, and the examples and reader cases under `protocol/` pin the two sides together: both test suites read them in place.
- **Conformance data** — `conformance/` holds what both implementations of the game rules test against, and what computes it, read in place by both test suites. `conformance/README.md` describes each file.

### The simulation cycle

`Simulation.step()` is one loop, as `simLoop` in the original: `_simFrame()` gates on the game speed, then every sprite moves. The gate is the saved `_speedCycle` counter, which lets a phase through on every 5th step at slow speed, every 3rd at medium and every step at fast. A paused simulation's step does nothing. The step count, never wall time, advances the city. Each step that passes the gate runs `simulate()`, which advances one phase of a 16-phase cycle:

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
- `simulation.random` is the simulation's random stream (`random.ts`), seeded from the game seed. The map generator draws from the same seed's map stream, so one seed reproduces map and city. The `random.ts` header specifies the stream, which the C# port (`RandomStream` in `server/Micropolis.Rules`) reproduces bit for bit. `conformance/random.json` holds reference vectors computed by the reference C implementation, and the tests of both read it in place.
- A stateful component's `save(saveData)` and `load(saveData)` write and read its fields under its own key of the save. What the scans derive is saved under `scannedState` instead, through `saveScan` and `loadScan`: the census has both pairs, and the power manager, which holds only scan results, has only the scan pair. `test/savedFields.ts` fails on a field a component holds but neither saves nor explains. A save holds the complete simulation state, the stream's included, so a loaded city continues exactly as it would have without the save; `docs/state-hash.md` lists every key, and a field the simulation adds is saved and listed there too. The `Simulation` constructor starts a new city from a seed, and `Simulation.fromSave` builds one from a save. `Simulation.load` restores a save over a city of the same map size, and nothing of the city it replaces survives. It restores without scanning, except for a browser save that `transitionOldSave` migrated from a version without the scanned state: that save's scanned state is `null`, so loading derives it by scanning from a new city's scanned state, then restores the rest of the save over whatever the scan changed. `storage.js` writes the combined object, versions it (`Storage.CURRENT_VERSION`) and migrates old saves (`transitionOldSave`). A change to saved state bumps the version, adds a migration step and updates the golden hashes in the same commit.

### Events

`eventEmitter.js` decorates a constructor or object with `addEventListener`, `removeEventListener` and `_emitEvent`. Event names live in `messages.ts`. Subsystems emit, `Simulation` re-emits upward, and the UI listens: the simulation never calls UI code.

A condition that holds over time (power load against capacity, a demand cap, an advisor warning) is state, published each cycle in the `CITY_STATUS_UPDATED` record that `statusPanel.ts` renders. A `FRONT_END_MESSAGE` notification announces a condition or a one-off event and then times out; the record is what shows a condition for as long as it holds. The record is built each cycle and not saved, but its sources are: the power figures from the last power scan, and the cap flags from the valves.

### Sprites

`spriteManager.js` and the `*Sprite.js` files: train, ship, plane, helicopter, monster, tornado and explosion. Sprites move once per simulation step (`Simulation.step` → `spriteManager.moveObjects`), at the same rate whatever the game speed, and draw from the simulation's stream, so their behaviour, including the map damage a crash, monster or tornado causes, is part of the deterministic simulation.

### Commands

A command is a change a player makes to the city, as plain JSON, defined in `commands.ts`, which is the multiplayer protocol. Tools, the budget window, the disaster menu, the debug grant and the auto-budget and disaster settings send commands; the speed controls still write to the city directly. `Simulation.applyCommands` validates each command (`commandRejection`) and applies it, separately from `step()`. A rejected command changes nothing. Each command's result, with the player who sent it, its outcome and the reason for a rejection, is emitted as `COMMAND_RESULT`; the simulation never branches on the player. `commandQueue.ts` drives a simulation as the browser does and the server will: commands queue as they arrive and apply in arrival order whenever `applyCommands` is called, every tick whether or not the city is stepping, and each is stamped with the index of the step it precedes.

### Tools

`*Tool.js` on top of `baseTool.js`; `cityTools.ts` builds the tools that change the city, with their costs, which the simulation applies tool commands with. A tool command applies its tool at each tile of its path in order, as one click each: the tool stages its edits in a `WorldEffects` (`worldEffects.js`), drawing from the stream as it goes, checks the funds, then writes the staged tiles to the map and charges the budget. The query tool only reads the city, and belongs to the UI.

## Rules for simulation code

- **Deterministic.** Randomness comes only from `random.ts`; time comes only from counters the simulation advances as it steps. A `Math.random`, `Date` or `performance.now` read inside simulation code is a defect to fix, not a pattern to copy. Only what changes city state draws from the simulation's stream, tools and disasters included; the UI's own randomness, such as picking a new seed, comes from `uiRandom.ts`.
- **No DOM.** No `window`, `document` or jQuery in simulation modules.
- **Simulation modules** are every file the simulation (`simulation.js`), the map generator (`mapGenerator.js`) or a map-editing tool (`cityTools.ts`, and every `*Tool.js` but the query tool) imports, directly or not. `test/simulationImports.ts` walks that graph with the TypeScript checker and fails on any global but a short list of pure built-ins, on any `Math` function outside the portable ones, and on `**`, a package import or a dynamic import.
- **Portable arithmetic.** No transcendental `Math` functions (`sqrt`, `pow`, `sin`, `log`…) in simulation code: their results can differ between runtimes. Arithmetic, `Math.floor` and `Math.round` are fine, provided the C# port mirrors JavaScript's `Math.round`, where halves round toward +∞ rather than to even. `Math.fround` is fine too: it rounds to the nearest IEEE single, as a C# `(float)` cast does. It reproduces the original's float arithmetic where a rule depends on it, provided every float operand and the result of each single `+`, `-`, `*` or `/` is wrapped in it: `Math.fround(Math.fround(a) * Math.fround(b))` is the float product, but `Math.fround(a * b + c)` is not the float sum of a float product.
- **Rule changes are deliberate.** The original's numbers are tuned against each other. A change to how the city behaves is named as such in its commit, never folded into a refactor. `test/goldenHashes.ts` pins each fixture's state hash as built and after a fixed run. A change to a fixture's script, to saved state or to a rule moves them, and that commit updates them; a refactor that moves one is a defect. A run hash that moves while the built hash holds is a change to how the city behaves.

## The original as reference

The original C/C++ source is the behavioural reference: <https://github.com/SimHacker/micropolis>, engine in `MicropolisCore/src/MicropolisEngine/src/`. The behaviour of the original's windows, such as the budget window's sliders, lives in the older C and Tcl version under `micropolis-activity/src/sim/` (`w_budget.c`, `w_sim.c`) and its Tcl scripts. This port follows it closely, function by function — for example `boatSprite.js` mirrors `doShipSprite` in `sprite.cpp`. When something behaves oddly, compare against the original before calling it a port bug: much odd behaviour is faithful to 1989, such as ships that wander the channel at random and wreck at dead ends.

Where the original's behaviour is undefined in C, the port keeps defined, portable behaviour and names the divergence in a comment at the code. Implementation-defined integer narrowing is matched.

## Code style

- New modules are TypeScript. Convert a legacy client module whole, together with its tests, rather than mixing styles inside one file. Legacy simulation modules are not converted, since the C# port retires them.
- JavaScript modules name the file extension in their imports (`./tile.ts`, `./game.js`); webpack's `extensionAlias` resolves both. TypeScript modules import TypeScript files without an extension (`./tile`), because `tsconfig.json` rejects a `.ts` suffix, and name it for JavaScript files (`./text.js`).
- `tsconfig.json` is strict, including `noUnusedLocals` and `noUnusedParameters`.
- Every source file keeps the GPL and Micropolis header comment at the top, new files included, C# and C as well.
- C#: block-scoped namespaces, explicit types rather than `var`, and nullable reference types; `server/Directory.Build.props` treats warnings as errors. Tests are MSTest, named `Method_Scenario_Expectation`.

## License and naming

- The code is GPLv3 with EA's additional terms (`LICENSE`, `COPYING`). Any build served to players must come with its source under the same license.
- Modified versions must be marked as modified and not presented as the original program. Never use the SimCity trademark or claim affiliation with Electronic Arts.
- The name "Micropolis" is governed by `MicropolisPublicNameLicense.md`. Read it before any naming or branding decision.

## Hard Rules — Stop and Ask

If any of these arise, **stop immediately** and ask for guidance before continuing:

1. **Architectural dead-end**: the implementation cannot be solved cleanly. Explain the constraint and suggest clean alternatives.
2. **Hacky path**: mid-implementation you realise the approach involves workarounds or quality compromises. Discard it and propose the clean path. No sunk cost fallacy, no "just make it work for now".
3. **Against the direction**: the right implementation contradicts the Direction section or settles an Open decision. Raise it first; don't drift silently.
