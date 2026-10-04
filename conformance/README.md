# Conformance data

Data that the C# implementation of the game rules tests against, read from here rather than copied: the random
stream's vectors, which the TypeScript tests read too, and files the TypeScript reference writes, among them the
end-to-end playthrough's log, which the browser recorded and the generator copies, and the command logs, which the C#
fixture tool must write the same.

## random.json

Reference vectors for the simulation's random stream, specified in `src/random.ts`. `random.c` writes the file: it
runs the reference C implementations of xoshiro128** 1.1 and SplitMix64 (<https://prng.di.unimi.it/>), with
`getRandom`, `getRandom16Signed`, `getERandom` and `getChance` written in C over the same 16-bit draws as
`random.ts` specifies them. To change or extend the vectors, edit `random.c` and regenerate:

```bash
cc -O2 -o conformance/random conformance/random.c && conformance/random > conformance/random.json
```

The program it builds, `conformance/random`, is ignored by git. CI builds and runs it too, and fails unless its output
is the committed file byte for byte, so the vectors cannot drift from the program that computes them.

- `seeds`: for each seed, the state SplitMix64 fills, the first raw draws, and the state after one `jump()`.
- `getRandom`: from the seed, `callsPerMaximum` calls with each maximum in turn. Some of the draws are rejected, and
  the maximum 32767 has a range of 32768, which divides 65536 but not 65535, so the outputs pin the rejection
  sampling and its 0xffff bound.
- `getRandomAtTheBoundary`: consecutive calls with one maximum. The seed's first 16-bit draw, 57033, equals the largest
  multiple of the range, 57033, so it is rejected; accepting it would give 0. Both sides' tests check that first draw,
  so a change of seed or maximum that loses the boundary fails them.
- `getRandom16Signed`, `getERandom`, `getChance`: consecutive calls from the seed.

Seeds and 32-bit words are hex strings, as the C reference prints them.

## Files the TypeScript reference writes

`generate.ts` writes `tiles.json`, `canonicalJson.json`, `maps.json`, `saveStrings.json`, `messages.json`,
`saves/`, `helpers.json`, `speedGate.json`, `commands.json`, `migrated/`, `logs/`, `snapshots/`, `runs/` and `traces/`
from the TypeScript game rules. Regenerate them in the commit that changes what they are computed from:

```bash
npm run conformance
```

A file it no longer writes is gone after it runs. CI runs it too, and fails unless the committed files are what it
writes. The generator rewrites a gzipped file only when the text it holds changes, so an unchanged file keeps its
committed bytes whatever another zlib would write. The server's tests only read them.

### tiles.json

Every name `src/tileValues.ts` and `src/tileFlags.ts` export, with its value. The C# `TileValues` and `TileFlags`
hold the same names with the same values.

### canonicalJson.json

The canonical text `src/canonicalJson.ts` writes (`docs/state-hash.md`), for:

- `numbers`: doubles, each given by its IEEE 754 bits, so negative zero and every digit are exact. They cover each
  layout of `Number::toString`, the boundaries between them, every funding share the budget can set as a
  single-precision value, and doubles drawn uniformly from their bit patterns.
- `strings`: strings given as UTF-16 code units, so lone surrogates can be written: every code unit below U+0080,
  characters written as themselves, and surrogates alone, paired and out of order.
- `documents`: JSON documents, whose keys are sorted and whose numbers are rewritten.

The generator fails if the numbers stop covering a layout.

### maps.json

What `src/mapGenerator.js` generates from the map stream of each seed (`src/random.ts`):

- `seeds`: each seed, the `kind` of land the generator laid (`island`, an island with no river; `nakedIsland`, an
  island coast with rivers and lakes; `land`, rivers and lakes on open land; `landAfterIslandDraw`, the same after
  the extra draw that decided against an island), how many `lakes` it drew, and the SHA-256 of the canonical text of
  the `map` object `GameMap.save` writes. The seeds are the first, counting from zero, that cover three maps of each
  kind, a map with rivers and no lakes and one with the most lakes, and the largest seed. The generator fails if the
  first 10000 seeds don't cover them.
- `maps`: the whole `map` object of the first seed of the island, naked island and land kinds, with its tiles one row
  per line, so a mismatch can be located.

### saveStrings.json

The strings a save may hold, in order, which the C# save model's names are checked against: `cityClasses` and
`scoreReasons`, `CITY_CLASSES` and `SCORE_REASONS` in `src/protocol.ts`, and `cityClassMessages`, the `REACHED_`
messages of `src/messages.ts` that announce a new city class, smallest class first.

### messages.json

Every name `src/messages.ts` exports, with its string or list of strings, which the C# `Messages` names are checked
against. An event is known by its string alone, and the TypeScript tests check that no two names share one.

### saves/

Each fixture's saved state (`docs/state-hash.md`), as the TypeScript simulation writes it when the fixture's command
log (`headless/fixtures/`) is replayed: `<fixture>.built.json` at its first checkpoint, as its log builds it, and
`<fixture>.run.json` at its last, after its golden run. Each file is the canonical text alone, with no final newline,
so its SHA-256 is the state hash, and the generator fails unless the replay matches the fixture's golden hashes up to
that checkpoint. `checkpoints.json` lists the step of each fixture's built and run checkpoints.

The benchmark (`server/Micropolis.Benchmarks`) reads them too: it takes its fixtures from `checkpoints.json`, and runs
each from its `<fixture>.run.json`.

### helpers.json

What the helpers the tile handlers share answered in the TypeScript:

- `valuePredicates`: each predicate of `src/tileUtils.js` that reads a tile's value, with a character per tile value,
  `1` where it holds; `zonePredicates`, the same for those that read a zone's centre, given a tile with the zone flag.
- `checkZoneSize`: `ZoneUtils.checkZoneSize` of each tile value; `checkBigZone`, `ZoneUtils.checkBigZone` of each tile
  value as `[zoneSize, deltaX, deltaY]`.
- `zones`: each zone centre in the fixtures' saves (`fixture`, `point`, `x`, `y` and its `value`): the
  `population` its own `kind` of zone counts, for a residential, commercial or industrial zone, the
  `perimeterRoad` `Traffic.findPerimeterRoad` finds, or `null`, and `ZoneUtils.getLandPollutionValue` there
  (`landPollutionValue`). The generator fails unless they cover an empty residential zone, a commercial and an
  industrial zone, a zone with no road on its perimeter, and each land pollution value from 0 to 3.
- `fireZones`: each zone centre of the built saves of the fixtures `generate.ts` names, set on fire by
  `ZoneUtils.fireZone` (`fixture`, `x`, `y`, `value`), then a power plant laid in the map's lower right corner first
  (`laid`, the size of the zone laid, or `null`), whose sweep runs off the map: the `rateOfGrowth` of its block after,
  and the `areaSize` by `areaSize` tiles from the centre's upper left neighbour after (`area`), as raw values row by
  row, seven by seven but for the corner's. The generator fails unless they cover the airport, a 4×4 zone and a 3×3
  zone.
- `rateOfGrowth`: `ZoneUtils.incRateOfGrowth` by `delta` on a block whose rate of growth was `start`, and the
  `result`, from either end of the map's range to its middle.
- `putZones`: `ZoneUtils.putZone` on a `fixture`'s built map, at the centre (`x`, `y`) of its first three by three
  tiles with none from flood up, of a `centreTile`, powered or not (`isPowered`), with one tile of the area first
  overwritten by a `blocker` (`dx`, `dy` from the centre, and its `value`), or `null`: whether the zone was `laid`,
  and the five by five tiles around the centre after (`area`), as raw values row by row. The generator fails unless a
  zone is laid and a zone is stopped.
- `repairs`: each zone centre of `repairFixture`'s built save, with the tiles `repairDamage` gives, relative to the
  centre, overwritten, then checked by the repair manager at a `cityTime`: whether it `repaired` anything, and the six
  by six tiles from the centre's upper left neighbour after it (`area`), as raw values row by row. The generator fails
  unless a zone is repaired and a zone is left for another time.
- `sprites`: a fixture's save with the sprites `added` to the end of its list, a live ship and a dead monster, of
  types the list held none of, since a list holds at most one sprite of each type but explosions: the index of the
  sprite `spriteManager.getSprite` finds of each type, the type's one sprite while it is alive, or `null`
  (`firstOfType`), and `getBoatDistance` from tiles (`boatDistances`). The generator fails unless a type's sprite is
  found and a dead one is not.

### speedGate.json

The steps at which each running speed lets a phase through: the city of `fixture` from its built save, run for
`steps` steps at each speed, with the step counter it starts from (`speedCycle`) and the steps, counted from 0, that
ran a phase (`phaseSteps`). The run passes the counter's wrap from 1023 to 0, which shifts the slow and medium gates.
The built save is the replay of the fixture's log to step 0, which the generator checks against the golden hash there,
as it does each city the snapshots start from.

### commands.json

Commands applied to a city, each with the result the simulation gave it, which checkpoint hashes can't tell apart:
`commandCases.ts` lists the commands, and the generator applies them. Each of `cases` holds a `description`; the city
the commands apply to, the built save of a `fixture` (`saves/<fixture>.built.json`), or a `state` it holds, such as a
new city on a small blank map; `results`, each command's result in the order applied, as `COMMAND_RESULT` carries it
(`player`, `command` as it arrived, `outcome` and `reason`); and `hash`, the state hash of the city after them all.
The C# applies each case's commands to its city as their players sent them, and must emit the same results, each
rejection's reason word for word, and leave the same hash.

The cases reach every reason `commandRejection` gives and every outcome, and the generator fails unless they do. The
small map's longest command, 3072 characters, is short enough to list one either side of it, with characters
`JSON.stringify` escapes, in a type and in a key, and numbers it writes as `Number::toString` does. The commands are
any JSON, a key that is a lone surrogate included, so the C# reads the file as `JSON.parse` does (`JsonText`).
Each disaster the player can trigger is a case of its own, so its hash shows what that disaster did.

### saveVersions/ and migrated/

`saveVersions/` holds sample saves as the browser stored them, the game's own keys and the version included, one or
more of each save version from 5 on: the oldest the C# migrates, the first that holds the complete simulation state.
Each was written by the game of its version, and they are never regenerated, since a version's format never changes:
`version7AwaitingBudget.json` was saved while a year end waited for the player, which the step from version 7 pays.
The generator writes nothing there, but fails unless every version from 5 to the current one has a sample, so a new
version adds one, written by the game of the commit that adds it. A sample is the output of the game that wrote it,
byte for byte, so writing it again from that commit gives the same file. The samples were written by these commits on
`main`:

| Sample | Commit |
|--------|--------|
| `version5.json` | `054dbaf` |
| `version6.json` | `5b15221` |
| `version7.json`, `version7AwaitingBudget.json` | `824956a` |
| `version8.json` | `051aa86` |
| `version9.json` | `17098d0` |
| `version10.json` | `faeaf92` |

`migrated/<sample>.json` is what the TypeScript loads each sample to, `SaveFormat.parse` and then the simulation's
load, as canonical text: the C#'s `SavedGame.Load` must load the sample to the same state.

### logs/

Command logs (`docs/command-log.md`), which the C# replays to every checkpoint, each laid out a line to each entry and
each checkpoint, so a diff shows which moved:

- `<fixture>.log.json`: the log `npm run fixtures` exports for each fixture, with its golden hashes as its
  checkpoints.
- The mid-run logs, `MID_RUN_LOGS` in `generate.ts`: a fixture's log with commands sent partway through its run,
  which no fixture's log has, since a fixture's commands all precede its first step. `suburbMidRun.log.json` sends
  tool commands, and has a step that pauses the city, takes a command and resumes it. `suburbBrokeDisasters.log.json`
  triggers every disaster a player may, one after another, each running into the next, in the broke suburb, which has
  the nuclear plant a meltdown needs. A mid-run log's checkpoints are the TypeScript replay's state hash where it
  starts, at each step that applies commands, after them, and at its last step, so a command applied a step early or
  late moves the hash at its own step. The generator fails unless each of those commands applies, and unless each
  step's commands change the city.
- `playthrough.log.json`: the end-to-end playthrough's log, from `e2e/goldenPlaythrough.json`, with the game's own
  checkpoints. `npm run e2e:golden` rewrites the golden file, and the generator copies its log, so a change that moves
  the playthrough runs `npm run e2e:golden` first: until then the generator fails, since the golden log no longer
  replays, and the end-to-end run needs Chromium. The generator fails too when there is no golden file. A stage's
  checkpoint is not a checkpoint of the log, since a stage may end partway through a step's commands, so only
  `test/playthroughReplay.ts` checks those.

The generator reads each file back as a replayer reads it, and fails unless it replays to every checkpoint. It fails
too unless one log starts from a seed and another from a save. `npm run simulate -- --log
conformance/logs/<name>.log.json` replays one headless, and `dotnet run --project server/Micropolis.Headless -- --log
conformance/logs/<name>.log.json` in C#.

The C# fixture tool writes every file here too, from the C# rules: `dotnet run --project server/Micropolis.Headless
-- --write-fixtures`. It lays out each fixture's and mid-run log's commands as the scripts do, in `Fixtures.cs`, and
works out the checkpoints by replaying them, and copies the playthrough's log from its golden file, as the generator
does. A log that starts from a save, the city a fixture's script writes onto, keeps the save the file holds: that save
is committed data, which no C# code builds. While the TypeScript simulation exists, the generator writes the logs, and
`FixtureLogsTests` fails unless each log the tool writes is the file here byte for byte.

`ConformanceLogs` reads the logs with `CommandLog`, as `parseLog` does, and more strictly, as the readers of the other
files here read theirs: it refuses a key the format doesn't define, a `level` beside a `save`, which `parseLog`
ignores, and a log with no checkpoint. `LogReplayTests` replays every log in the directory through `LogReplay`, as the
headless runners replay one: from a new city on the seed's map, at the log's level and medium speed, or from its save,
it applies each step's commands through `Simulation.ApplyCommands`, checks the step's checkpoints, then takes the
step. A difference names the first checkpoint whose state hash differs, the step at which the log has a paused city
step, or city time that fell behind the steps. A command's result is held by `commands.json`, since a checkpoint
can't tell one rejection from another.

### snapshots/

Unit snapshots: calls of the simulation's units of work, each with the saved state before and after it and the events
it emitted, so the C# port proves each unit on its own. `unitSnapshots.ts` records them, and `snapshotPoints.ts` says
which calls.

#### Units and their names

A unit is a function the cycle calls, keyed in `UNITS` in `unitSnapshots.ts`, and named by its module and function as
`src/` names them: `census.take10Census`, `blockMapUtils.crimeScan`, `simulation._sendMessages`.
`simulation._simulate` is one pass the speed gate lets through: the city's first evaluation if it is still due, then
one phase. `simulation.applyCommands` applies the commands a city receives, between steps rather than in the cycle.
A handler the map scan calls is named by its family and its function, `residential.residentialFound`. A handler family
is a module that registers handlers with the map scanner and zones with the repair manager. Families are named by
their modules, `FAMILIES` in `unitSnapshots.ts` and `Simulation.HandlerFamilies` in C# list them in
`Simulation.init`'s order, and a C# test checks that order against the records. Where a unit reaches the sprites or
the disasters, the names are `spriteManager.makeExplosion` and `disasterManager.doMeltdown`.

These names are the contract between the two sides: the C# runs a record's unit by its name, and a record names every
unit it reached. A record whose call reaches the disasters or a transport handler, such as phase 15's or a map scan's
over a rail tile, holds the C# to them as to any other unit. The sprites' moves are no unit, since the step makes
them outside the phases: the traces prove them, and call the disasters and the transport handlers directly besides,
for runs too long for snapshots, which keep the whole state before and after each call.

#### Records

Each file is `<fixture>.<unit>.json.gz`: gzip over the canonical text (`docs/state-hash.md`) of a list of records, each
an object of:

- `fixture` and `step`: the fixture whose city made the call, run at its saved speed from its built save,
  checked against its golden hash, and the step, counted from 0, during which the call came.
- `unit` and `args`: the unit's name, and its arguments that are not simulation state. `mapScanner.mapScan`'s are its
  first column and the column after its last; `simulation.applyCommands`'s one argument is the commands it applies,
  each `{"player", "command"}`; every other unit's are `[]`.
- `handlers`: the handler families registered for the call, in the order registered: every family, in
  `Simulation.init`'s order, but in the map scan's records of a point with `"each"`, which register none or one, so
  one family's handlers are proven alone.
- `before` and `after`: the saved state before and after the call.
- `events`: every event `Simulation` emitted during the call, in order, as its listeners receive them: `name`, the
  event's string, and `payload`, unless it was emitted without one. A payload is plain JSON, a member that is
  `undefined` left out as `JSON.stringify` leaves it out.
- `reached`: every unit, handler and sprite or disaster function the call reached, the unit itself not counted, each
  once, in the order first reached.

`index.json` lists every record: its `file` and its position there (`record`), and its fields but the states and the
payloads, with the speed by name and the events by name. A pull request's index diff shows the points it adds.

#### Points

A point names a call to record: a `fixture` of a kind below that records snapshots, whose city runs at its saved
speed, a `unit`, and which of its calls (`call`, counting from 0 among the calls `where` accepts, given the city as
the call finds it). `handlers` is every family when left out, or `"each"` for `mapScanner.mapScan`: one record with
no handlers, and one with each family alone whose handlers the call reaches with every family registered. `reaches`
names a branch, and tests that a record of the point reaches it, so a point with `"each"` reaches a family's branch in
that family's record, though not in the record with no handlers. On a point with `"each"`, `reaches` may name a
`family`, and then that family's record alone must reach the branch: the generator fails when the call makes no
record of that family. A point's `where` that tries a unit on a copy of the city runs it in `unrecorded`, which
`unitSnapshots.ts` exports; otherwise the copy's call of the unit counts among the city's own calls.

Each fixture in `headless/fixtures/index.ts` has a `kind`, which says what proves its city beside its runs (`runs/`),
which every fixture has. A `"snapshots"` fixture records the points seeded below, and a `"branch"` fixture, made for a
branch of a unit, records only the points that name it. A `"runs"` fixture records none: its runs prove its city, with
any traces that start from it.

The points seeded are, in each `"snapshots"` fixture, the map scan's first sweep, its eight calls, with `"each"`, and
every other unit's first two calls; every phase of the suburb's first cycle; and phase 0 alone in each such fixture: a
cycle that sets no valves, after the first evaluation. Then each gate of the cycle, a phase on the cycle that opens it
and, where one exists, on one that doesn't: phase 0 setting the valves; phase 9's census, long census, and tax and
evaluation, each when its city time falls due; phase 10 easing the rate of growth or not; and the scans of phases 11 to
15 at each speed, from the suburb and from the `"branch"` fixtures `suburbSlow` and `suburbFast`, the suburb set to slow
and to fast. The `"branch"` fixture `disasters` lays out a scene for each rare branch of the infrastructure handlers
that `snapshotPoints.ts` names, each in a strip of the map of its own. Each branch's point is a map scan of that strip
with `"each"`, and names the family whose record must reach the branch. The fixture also records its first disaster
phase, which counts its flood down. Then each branch of the zone handlers and the drives they make, as
`zoneBranches.ts` tells them from a trace of the call run with the family alone, from the suburbs and from the
`"branch"` fixtures `hospitalTown`, `roadlessTown` and `smokyWoods`: a point names every branch its call must reach,
several where one call reaches them together, since each point records the whole city. A point for a rare branch names
the branch in `reaches`, so a change that stops the point reaching it fails the generator rather than leaving the
branch unproven.

A test fails on a point naming a `"runs"` fixture.

No step applies a command, so `simulation.applyCommands` has points of its own, `COMMAND_POINTS` in
`snapshotPoints.ts`, recorded by `recordCommandSnapshots`: a fixture, the steps its city runs from its built save
first, and the commands. Each is recorded by replay from the city's state there, and the commands applied to the city
that stepped there must leave what the replay did; they never reach a fixture's run that the other points record from.
The points cover each tool's rules and costs, the building, road, rail and wire tools beside what they connect to,
over water and with auto-bulldoze on and off, funds spent to nothing, and the settings commands among rejected ones,
and each names in `reaches` the outcomes it must come to.

The generator fails when:

- a fixture's city as built does not match the golden hash its log pins at step 0, or the log pins none there;
- registering the families as it does registers what `Simulation.init` does differently, or a family registers
  handlers other in number or name than `FAMILIES` lists;
- an event is emitted with a `null` payload, which a record could not tell from none: emit it without one, or with an
  object;
- a call replayed from the state before it, with every family registered, does not leave the state and the events the
  city's own call did;
- a point's call is not found within 20000 steps, or no record of a point reaches its branch, or the record of the
  family it names does not;
- a unit has no record, or the gzipped files take more than 5 MB, past which fewer points are recorded rather than
  fewer units.

#### The C# side

`UnitSnapshotTests` runs every record the index lists, through `UnitSnapshotRunner`: it loads `before` with
`Simulation.FromSave`, which registers every family as the simulation does, and registers `handlers` instead with
`Simulation.RegisterHandlers` when they are fewer. It calls the unit as the cycle does, or for
`simulation.applyCommands` as a city source does, from a table with a case per unit name, and compares `after` key by
key in the canonical text's order, then the events in order. A difference names the first key that differs and both
values, and for an entry of the tiles, a block map or the power grid, the tile's or the block's position. Every record
must pass: nothing may differ.

### runs/

City runs: a city stepped at one speed for many steps, with its state hash at each checkpoint and every event the
simulation emitted, so the C# port proves the whole cycle, every unit running together, against the TypeScript.
`cityRuns.ts` records them.

A run starts from a new city on the map a seed generates, as the browser starts one, for each seed of `maps.json`, the
seeds taking the levels easy, medium and hard in turn; or from a fixture's city as built (`saves/`), at its saved
level, with the sprites it makes and, in `harbourWithDisasters`, random disasters striking. Each start is run at
slow, medium and fast speed, a fixture's saved speed overridden as the headless runner overrides it, for as many
steps as the fixtures' golden run takes, `RUN_STEPS` in `headless/fixtures/fixture.ts`, in which a city reaches a
year end at every speed. A start that is the state another run starts from, such as a fixture that differs from
another only in its saved speed, makes the same run and is recorded once.

`index.json` lists each run: its `file`; its `seed` and its `fixture`, one of them `null`; the `level` its city is at,
which for a fixture is its saved level; its `speed`, `steps`, how many `events` it emitted, and its `checkpoints`,
each a `step` and the state `hash` after that many steps: at step 0, as the city starts, after its first scans for a
new city, and then every 256 steps and at the last. A pull request's index diff
shows which hashes it moves. Each file, `<fixture>.<speed>.json.gz` or `seed<seed>.<speed>.json.gz`, is gzip over the
canonical text of the run's events, in order, each with the `step`, counted from 0, during which it was emitted, its
`name` and its `payload`, as a unit snapshot's record holds them.

The generator fails when:

- a fixture's run at its saved speed, which is its golden run, does not end at its golden run hash;
- a run reaches no year end, or the runs together don't cover a year's budget that auto-budget paid, one it ran short
  of, and one with auto-budget off;
- no run has a live sprite moving, or a random disaster of some kind, a fire, a flood, an earthquake, a tornado or a
  monster, strikes no run;
- no new city runs at one of the levels, or the gzipped files take more than 5 MB.

`CityRunTests` runs every run the index lists, through `CityRunner`: it starts the city, `Simulation.NewCity` for a
seed, steps it, and at each checkpoint compares the events emitted before it, in order, then the state hash. A
difference names the first event that differs, with its step, or the first checkpoint whose hash does. A run that
diverges is diagnosed with the unit snapshots: a record whose unit fails names the unit, key and tile. When every
unit's snapshots pass and a run still diverges, the gap is in the snapshots, which don't reach the branch the run
does, or in the integration, how the cycle calls the units; a point recorded at the step the run names tells which.

### traces/

Traces: a fixture's saved city, then a run of calls into the sprites, the disasters and the transport handlers, each
with the state hash after it and the events it emitted. `traces.ts` records them, and `tracePoints.ts` lists them, with
the calls each makes. A unit snapshot keeps the whole state before and after one call; a trace keeps a hash, so it
affords thousands of calls, the sprites' moves among them, and a mismatch names the first call after which the states
differ.

Each file is `<name>.json.gz`: gzip over the canonical text of one trace, an object of:

- `name`, and `fixture` and `point`: the fixture's save in `saves/`, `built` or `run`, the city starts from.
- `changes`: keys of the save, as dotted paths, set to the values given before the city is built from it, such as
  `disasters.disastersEnabled`, `sprites.list` set to `[]` to clear the sprites in flight, or set to sprites placed
  where they collide.
- `tiles`: tiles of the saved map, each an object of `x`, `y` and `value`, the raw value it is set to after the
  changes, for a layout no fixture builds, such as a loop of rail or a channel alone on an edge of the map.
- `calls`: each an object of `unit` and `args`, the call; `hash`, the first 12 hex digits of the state hash
  (`docs/state-hash.md`) after it; and `events`, every event `Simulation` emitted during it, as a snapshot record holds
  them. The units are `spriteManager.moveObjects`, the pass of the sprites a step makes; the disasters, by their
  function, `disasterManager.makeEarthquake` and the rest, with `disasterManager.doDisasters` taking the game level as
  its argument; `spriteManager.makeMonster`, `makeMonsterAt`, `makeTornado` and `makeExplosion`; and the transport
  handlers, `transport.railFound`, `portFound` and `airportFound`, each with the tile it is found on.

A trace sets off a disaster by calling the disaster manager's or the sprite manager's own function directly, where a
command log sends a `triggerDisaster` command, so the trigger's own code is compared. Each trace is built for the
branches it names in `tracePoints.ts`, and runs until what shows them has happened: a train turning both ways and
crossing a bridge, the vehicles a monster stands on crashing, each random disaster drawn, and the monster drawn where
the pollution is too low to raise one. The generator fails when a trace would
not reach what it is for, when a unit is called by no trace, and when the gzipped files take more than 1 MB. It checks
what a trace reaches by what the city shows, never by the C#: whether every branch of the C# is reached is for a
coverage run of `TraceTests` to show.

The C# side, `TraceTests`, replays each trace through `TraceRunner`: it builds the city from the save with the
changes and the tiles, makes each call from a table with a case per unit name, and fails naming the first call whose
hash or events differ from the TypeScript's. It compares the hash after every call, since a state may differ for one
call only, such as the frame a train shows on a bend.
