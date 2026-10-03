# The state hash

The state hash identifies a city's complete simulation state. Two simulations whose hashes match evolve identically
as long as they are given the same commands under the same player settings. The auto-bulldoze setting, which decides
whether the building tools clear trees and rubble first, is not city state and is not hashed (see the last section).
The headless runner prints the hash, and the C# port is correct when it produces the same hash from the same seed,
starting state and command log (`CLAUDE.md`, Direction 3). This document specifies it so the port can produce identical bytes. `src/canonicalJson.ts` and
`src/stateHash.ts` are the reference implementation.

## The hash

The hash is SHA-256 over the UTF-8 bytes of the **canonical text** of the **saved state**, written as 64 lowercase
hexadecimal digits.

## The canonical text

The canonical text is JSON with these rules:

- **No whitespace** anywhere outside strings.
- **Objects** have their keys sorted by UTF-16 code unit, which is ordinal order for the ASCII keys the state uses.
  Each key appears once.
- **Arrays** keep their order.
- **`true`, `false` and `null`** are written as such.
- **Strings** are escaped as ECMAScript's `JSON.stringify` escapes them: `"` as `\"`, `\` as `\\`, U+0008, U+000C,
  U+000A, U+000D and U+0009 as `\b`, `\f`, `\n`, `\r` and `\t`, any other code point below U+0020 as `\u00xx`, and
  a lone surrogate as `\uxxxx`, with lowercase hexadecimal digits. Every other character is written as itself.
- **Numbers** are finite and written in ECMAScript's `Number::toString` form (ECMA-262, *Number::toString*, radix
  10). Take the shortest decimal digit string `s` of `k` digits that round-trips to the same double, and the
  exponent `n` such that the value is `s × 10^(n − k)`. Then:
  - `k ≤ n ≤ 21`: the digits of `s` followed by `n − k` zeros (`1200`).
  - `0 < n ≤ 21`: the first `n` digits of `s`, a `.`, then the rest (`16.8`).
  - `−6 < n ≤ 0`: `0.`, then `−n` zeros, then `s` (`0.007`).
  - Otherwise: the first digit, then `.` and the remaining digits if `k > 1`, then `e`, then `+` or `-`, then
    `|n − 1|` (`1e+21`, `1.5e-7`).
  - A negative number is `-` followed by the form of its magnitude. Negative zero is written `0`.

  .NET's shortest round-trip formatting produces the same digits `s` but lays them out differently, so the port
  formats them by the rules above.
- **Nothing else** has a canonical form. Undefined values, NaN, infinities and non-data objects are errors, never
  dropped or coerced.

## The saved state

The saved state is the object `Simulation.save` writes. It holds everything that determines how the city evolves,
the random stream included, so a city restored from it continues exactly as it would have without the save.

Each component's state is an object under its own key: `simulation`, `map`, `evaluation`, `valves`, `budget`, `census`,
`sprites` and `disasters`. What the scans derive is under `scannedState`. Every key below is required. Unless noted,
numbers are integers. A list ordered "row by row" holds the entry for (x, y) at index `width * y + x`, where `width`
is the list's own width: the map's width in tiles for a per-tile list, and the block map's width in blocks for a
block map.

### Simulation

| Key | Value |
|-----|-------|
| `simulation.cityTime` | City time: four per month, 48 per year, counted from 1900 |
| `simulation.speed` | 0 paused, 1 slow, 2 medium, 3 fast |
| `simulation.gameLevel` | 0 easy, 1 medium, 2 hard |
| `simulation.speedCycle` | The step counter, 0–1023, which lets a phase through on every 5th step at slow speed, every 3rd at medium and every step at fast |
| `simulation.phaseCycle` | The phase the next simulation pass runs, 0–15 |
| `simulation.simCycle` | The cycle counter, 0–1023, which sets how often the slower scans run |
| `simulation.cityPopLast` | The population at the last growth check, which decides whether to announce a new city class |
| `simulation.messageLast` | The last city-class announcement sent, or `null`: `"Now a town"`, `"Now a city"`, `"Now a capital"`, `"Now a metropolis"` or `"Now a megalopolis"` (the `REACHED_` messages in `src/messages.ts`) |
| `simulation.lastPowerMessage` | The city time of the last power shortage or blackout notification, or `null` for none |
| `simulation.initialEvaluationPending` | `true` until the city has been evaluated before its first phase |
| `simulation.seed` | The game seed, a uint32 |
| `simulation.randomState` | The simulation stream's four uint32 state words (`src/random.ts`) |

### Map

| Key | Value |
|-----|-------|
| `map.width`, `map.height` | The map's size in tiles |
| `map.tiles` | One raw value per tile, row by row: the tile value (bits 0–9) combined with its flags (bits 10–15, `src/tileFlags.ts`) |
| `map.cityCentreX`, `map.cityCentreY` | The population centre |
| `map.pollutionMaxX`, `map.pollutionMaxY` | The most polluted tile |

### Evaluation

| Key | Value |
|-----|-------|
| `evaluation.cityClass` | `"VILLAGE"`, `"TOWN"`, `"CITY"`, `"CAPITAL"`, `"METROPOLIS"` or `"MEGALOPOLIS"` |
| `evaluation.cityScore` | The city score, 0–1000 |
| `evaluation.cityYes` | Voters approving of the mayor, out of 100 |
| `evaluation.cityPop`, `evaluation.cityPopDelta` | The evaluated population and its last change |
| `evaluation.cityAssessedValue` | The assessed value |
| `evaluation.cityClassLast` | The class last reported |
| `evaluation.cityScoreDelta` | The score's last change |
| `evaluation.problemVotes` | Seven `{"index", "voteCount"}` objects from the last poll, in the poll's sorted order |
| `evaluation.problemOrder` | The four top problems' indices, 7 for none |
| `evaluation.cityScoreBreakdown` | The last score calculation's steps, in order, as `{"reason", "points"}` objects: the points each step moved the score. The reasons, in calculation order, are `"PROBLEMS"`, `"RES_CAP"`, `"COM_CAP"`, `"IND_CAP"`, `"ROAD_FUNDING"`, `"POLICE_FUNDING"`, `"FIRE_FUNDING"`, `"RES_OVERSUPPLY"`, `"COM_OVERSUPPLY"`, `"IND_OVERSUPPLY"`, `"MIGRATION"`, `"FIRES"`, `"TAXES"`, `"UNPOWERED_ZONES"`, `"RANGE"` and `"AVERAGING"`. `"PROBLEMS"` and `"AVERAGING"` are always listed, and each other step only when it moved the score. The first is measured from last year's score, and the points sum to `cityScoreDelta`. Empty until the first evaluation, and after an evaluation that finds the city empty |

### Valves

| Key | Value |
|-----|-------|
| `valves.resValve`, `valves.comValve`, `valves.indValve` | Residential, commercial and industrial demand |
| `valves.resCap`, `valves.comCap`, `valves.indCap` | Whether the advisor has capped each demand |

### Budget

| Key | Value |
|-----|-------|
| `budget.totalFunds` | Funds |
| `budget.cityTax` | The tax rate, percent |
| `budget.autoBudget` | Whether the budget is set automatically |
| `budget.roadPercent`, `budget.firePercent`, `budget.policePercent` | The share of each service's need funded, a number from 0 to 1, not always an integer. The budget sets each one as a single-precision value, as the original keeps it, and the save writes the double it equals: 53% is `0.5299999713897705`, not `0.53`. A save written before the budget did so may hold any double, which loading keeps. |
| `budget.roadSpend`, `budget.fireSpend`, `budget.policeSpend` | The spend booked on each service, from which its effectiveness is set: what the player's funding costs, what the year-end budget paid, or the full cost of every service after an autobudget year end |
| `budget.roadMaintenanceBudget`, `budget.fireMaintenanceBudget`, `budget.policeMaintenanceBudget` | What each service needs |
| `budget.roadEffect`, `budget.fireEffect`, `budget.policeEffect` | Each service's effectiveness |
| `budget.cashFlow` | The last year's cash flow |
| `budget.taxFund` | The last tax collected |
| `budget.awaitingValues` | Whether the simulation waits for the player to set the budget |

### Census

| Key | Value |
|-----|-------|
| `census.resPop`, `census.comPop`, `census.indPop` | Residential, commercial and industrial population |
| `census.totalPop` | The normalised total population |
| `census.crimeRamp`, `census.pollutionRamp` | Smoothed crime and pollution |
| `census.landValueAverage`, `census.pollutionAverage`, `census.crimeAverage` | Map averages |
| `census.resHist10`, `census.comHist10`, `census.indHist10`, `census.crimeHist10`, `census.moneyHist10`, `census.pollutionHist10` | 120 entries each, newest first, one per 10-cycle census |
| `census.resHist120`, …, `census.pollutionHist120` | 120 entries each, newest first, one per 120-cycle census |

### Sprites and disasters

| Key | Value |
|-----|-------|
| `sprites.spriteCycle` | The sprite movement counter |
| `sprites.list` | Every sprite in the order they move, each an object with `type` (1 train, 2 helicopter, 3 airplane, 4 ship, 5 monster, 6 tornado, 7 explosion), `frame` (0 for a sprite that has died this pass), `x`, `y` (pixels), `origX`, `origY`, `destX`, `destY`, `count`, `soundCount`, `dir`, `newDir`, `step` and `flag`, and for a monster also `_seenLand` (boolean). A sprite's size and drawing offset are fixed by its type and not saved |
| `disasters.floodCount` | Passes left until a flood recedes |
| `disasters.disastersEnabled` | Whether random disasters happen |

### Scanned state

`scannedState` holds what the scans compute and later phases read.

| Key | Value |
|-----|-------|
| `scannedState.blockMaps` | One list per block map, row by row: `cityCentreDistScoreMap`, `crimeRateMap`, `fireStationMap`, `fireStationEffectMap`, `landValueMap`, `policeStationMap`, `policeStationEffectMap`, `pollutionDensityMap`, `populationDensityMap`, `rateOfGrowthMap`, `terrainDensityMap` and `trafficDensityMap`. A block map of block size `b` over the 120×100 map is `ceil(120 / b)` blocks wide and `ceil(100 / b)` high: 195 entries at size 8, 750 at size 4, 3000 at size 2. The `Simulation` constructor gives each map's block size and range. The temporary maps are scratch space and are not saved |
| `scannedState.power.powerGrid` | One entry per tile, row by row: 1 where the last power scan delivered power |
| `scannedState.power.powerStack` | The `{"x", "y"}` power sources the map scan has found for the next power scan, in push order |
| `scannedState.power.powerCapacity`, `scannedState.power.powerLoad` | The last power scan's capacity and load |
| `scannedState.census` | The census's scan counts: `poweredZoneCount`, `unpoweredZoneCount`, `firePop`, `roadTotal`, `railTotal`, `resZonePop`, `comZonePop`, `indZonePop`, `hospitalPop`, `churchPop`, `policeStationPop`, `fireStationPop`, `stadiumPop`, `coalPowerPop`, `nuclearPowerPop`, `seaportPop`, `airportPop` and `needHospital` (−1, 0 or 1), and `trafficAverage`, which is not always an integer |

## Golden hashes

`test/goldenHashes.ts` pins two hashes per fixture: the **built** hash of the state its script builds, and the
**run** hash after the number of steps given there (`STEPS`) at medium speed. `npm run fixtures` exports each
fixture's built state to `headless/fixtures/export/<name>.json`, whose SHA-256 is the built hash. The C# port takes
that file as its starting state, sets the speed to medium, steps it `STEPS` times and must produce the run hash.

## What the hash leaves out

The browser's own settings and UI state are not simulation state and are not hashed: the city's name, the auto-bulldoze
setting, and the save version, which `storage.js` adds when it writes to `localStorage`.

The simulation decides when to send the advisor's notifications, so the counters it decides that with are city
state and are hashed. What is left out is what only remembers what one display was last told, such as the last
date sent, which a fresh display needs sent again anyway.
