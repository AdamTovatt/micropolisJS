# Conformance data

What the game rules in `server/Micropolis.Rules` are tested against, read in place rather than copied: the random
stream's vectors, from a C reference program; the definitions the client's vocabulary and the C# rules are both held
to; the sample saves of each save version; and the goldens the fixture tool writes from the rules, among them the
end-to-end playthrough's log, which the game server recorded. Beside them, and no part of the rules, `grass.json`
holds the client's world grass to the art build's, as the art build's Python writes it.

## random.json

Reference vectors for the simulation's random stream, specified in `RandomStream` in `server/Micropolis.Rules`.
`random.c` writes the file: it runs the reference C implementations of xoshiro128** 1.1 and SplitMix64
(<https://prng.di.unimi.it/>), with `getRandom`, `getRandom16Signed`, `getERandom` and `getChance` written in C over
the same 16-bit draws as `RandomStream` specifies them. To change or extend the vectors, edit `random.c` and
regenerate:

```bash
cc -O2 -o conformance/random conformance/random.c && conformance/random > conformance/random.json
```

The program it builds, `conformance/random`, is ignored by git. CI builds and runs it too, and fails unless its output
is the committed file byte for byte, so the vectors cannot drift from the program that computes them. The C# tests
read the file.

- `seeds`: for each seed, the state SplitMix64 fills, the first raw draws, and the state after one `jump()`.
- `getRandom`: from the seed, `callsPerMaximum` calls with each maximum in turn. Some of the draws are rejected, and
  the maximum 32767 has a range of 32768, which divides 65536 but not 65535, so the outputs pin the rejection
  sampling and its 0xffff bound.
- `getRandomAtTheBoundary`: consecutive calls with one maximum. The seed's first 16-bit draw, 57033, equals the largest
  multiple of the range, 57033, so it is rejected; accepting it would give 0. The tests check that first draw, so a
  change of seed or maximum that loses the boundary fails them.
- `getRandom16Signed`, `getERandom`, `getChance`: consecutive calls from the seed.

Seeds and 32-bit words are hex strings, as the C reference prints them.

## grass.json

Reference vectors for the world grass the map draws under bare land, the woods and the water, and the wobble of the
canopy's edge and of the shore over it (`docs/render-assets.md`), which the client computes in `src/grass.ts` and the
art build in `art/tools/grass.py`, with the same arithmetic and the constants of the manifest's `grass`, `canopy` and
`water` sections. `grass.py` writes the file:

```bash
python art/tools/grass.py --vectors
```

`pytest art/tools/tests` fails unless the committed file is what it writes, and `test/grass.ts` holds the client's
hash and noise to it, with the constants of the committed manifest, so the two never drift apart. The values depend on
map positions alone, never on a city.

- `lowbias32`: the hash of whole numbers.
- `hashes`: the hash of lattice points, negative ones included, by two seeds.
- `tiles`: the corner tile each of some map tiles draws.
- `noise`: the share of straw, the tint and the wobbles of the canopy's edge and the shore at map positions, each exact
  to the last bit.
- `field`: the size of the baked field for the 120 × 100 map, and the SHA-256 of its bytes, row by row, the share, the
  tint, the canopy's wobble and the shore's of each texel.

## Definitions

Files edited by hand, which name what the client and the server must agree on. The C# tests hold the rules' own
definitions to them, and `test/vocabulary.ts` holds the client's vocabulary to them, so a name added on one side and
not the other fails a test. A change to one edits the file in the same commit as both sides.

### tiles.json

Every name `src/tileValues.ts` and `src/tileFlags.ts` export, with its value: `values`, the tile ids, and `flags`, the
flag bits of a tile's raw value. The C# `TileValues` and `TileFlags` hold the same names with the same values.

### messages.json

Every name `src/messages.ts` exports, with its string or list of strings: the names of the events the city sends,
which the C# `Messages` holds with the same strings. An event is known by its string alone, and each side's tests
check that no two of its names share one.

### saveStrings.json

The strings a save may hold, in order, which the C# save model's names are checked against: `cityClasses` and
`scoreReasons`, `CITY_CLASSES` and `SCORE_REASONS` in `src/protocol.ts`, and `cityClassMessages`, the `REACHED_`
messages that announce a new city class, smallest class first.

### canonicalJson.json

Cases of the canonical text (`docs/state-hash.md`), which the C# `CanonicalJson` must write. Unlike the other
definitions, only the C# tests read it: the client computes no hash, and asks the game server for a city's.

- `numbers`: doubles, each given by its IEEE 754 bits, so negative zero and every digit are exact, with the text
  `Number::toString` gives. They cover each layout of `Number::toString`, the boundaries between them, every funding
  share the budget can set as a single-precision value, and doubles drawn uniformly from their bit patterns.
- `strings`: strings given as UTF-16 code units, so lone surrogates can be written: every code unit below U+0080,
  characters written as themselves, and surrogates alone, paired and out of order.
- `documents`: JSON documents, whose keys are sorted and whose numbers are rewritten.

## saveVersions/

Sample saves, each the whole text of a game's save, its name and version included, one or more of each save
version from 5 on: the oldest `SavedGame` migrates, the first that holds the complete simulation state. Each was
written by the game of its version, and they are never regenerated, since a version's format never changes:
`version7AwaitingBudget.json` was saved while a year end waited for the player, which the step from version 7 pays.
`version14.json` is the commuters fixture after its run, whose rides load the line along row 15 between its stations
at (25, 15) and (44, 15), and nothing else, which the step from version 14 splits between the line's two ways.
`version15.json` is the same fixture after its run under the rules of version 15, uploaded to the server with the
name `Sample`: its rides load the same line eastward, the way from the north or west, and nothing else, which
`e2e/railLoad.spec.ts` draws the Rail load overlay over.
`SavedGameTests` also upgrades each as the bare state a command log holds, and `LogReplayTests` replays the sample of
the version before the current one from inside a log, as a log written before the last upgrade step was added.
The fixture tool fails unless every version from 5 to the current one has a sample, so a new version adds one, written
by the game of the commit that adds it: a Debug build of that commit's server answers a city's save text to the
debug channel's `savedGame` request (`CityDriver.savedGame` in `src/citySource.ts`), as its store keeps it. A sample
is the output of the game that wrote it, byte for byte, so writing it again from that commit gives the same file. The samples were written by these commits on `main`:

| Sample | Commit |
|--------|--------|
| `version5.json` | `054dbaf` |
| `version6.json` | `5b15221` |
| `version7.json`, `version7AwaitingBudget.json` | `824956a` |
| `version8.json` | `051aa86` |
| `version9.json` | `17098d0` |
| `version10.json` | `faeaf92` |
| `version11.json` | `78a9fa7` |
| `version12.json` | `e6d655a` |
| `version13.json` | `bae01e2` |
| `version14.json` | `6f2d270` |
| `version15.json` | `aed9205` |

## Files the fixture tool writes

The fixture tool, `server/Micropolis.Headless`, writes `logs/`, `saves/`, `events/`, `commands.json`,
`queries.json`, `speedGate.json`, `runs.json`, `maps.json`, `helpers.json`, `ruleConstants.json` and `migrated/` from
the C# rules, on the fixtures `server/Micropolis.Conformance` lays out, which the rules' tests
share. Regenerate them in the commit that changes what they
are computed from: a fixture's commands, saved state or a game rule (`CLAUDE.md`, Rules for simulation code):

```bash
dotnet run --project server/Micropolis.Headless -- --write-fixtures
```

It builds every file before it writes any, so a file that fails to build leaves them all as they were. The tool's
tests fail unless each file it writes is the committed file byte for byte, and unless each
directory holds only the files it writes, so the committed files can't drift from the rules that compute them. A
change to a rule moves the files it reaches, and the commit's diff of them shows what the change did. Each writer
fails, too, unless its cases still cover what the file is for (`EnsureCovers` in `ConformanceText`), so a file never
silently loses a case. The logs hold a line to each entry and each checkpoint, the events a line to each event, and
the other JSON files are written as ECMAScript's `JSON.stringify` writes them, a list one value to a line
(`JsonLines` in `server/Micropolis.Rules`), so a diff shows which moved; the saves and the migrated states are
canonical text alone.

### logs/

Command logs (`docs/command-log.md`), which the C# replays to every checkpoint:

- `<fixture>.log.json`: each fixture's log, which `Fixtures.cs` lays out, with its golden hashes as its checkpoints:
  one at step 0, of the city as its commands build it, and one after its run. Its commands are a player's, on seed
  8's map, and all precede its first step. A fixture that needs what no command places starts from a save instead,
  which its log keeps as committed data: no code builds it, and the tool writes it back as it reads it, its
  `saveVersion` included, so a change to saved state leaves it in the version it was written in, which the replay
  upgrades.
- The mid-run logs, `Fixtures.MidRun`: a fixture's log with commands sent partway through its run, which no
  fixture's log has. `suburbMidRun.log.json` sends tool commands, and has
  a step that pauses the city, takes a command and resumes it. `suburbBrokeDisasters.log.json` triggers every disaster
  a player may, one after another, each running into the next, in the broke suburb, which has the nuclear plant a
  meltdown needs. A mid-run log's checkpoints are where it starts, at each step that applies commands, after them, and
  at its last step, so a command applied a step early or late moves the hash at its own step. `FixturesTests`
  fails unless each of those commands applies, and unless each step's commands change the city.
- `playthrough.log.json`: the end-to-end playthrough's log, from `e2e/goldenPlaythrough.json`, with the game's own
  checkpoints. `npm run e2e:golden` rewrites the golden file, and the tool copies its log, so a change that moves the
  playthrough runs `npm run e2e:golden` first: until then the tool fails, since the golden log no longer replays. A
  stage's checkpoint is not a checkpoint of the log, since a stage may end partway through a step's commands, so only
  `GoldenPlaythroughTests` in `server/Micropolis.Headless.Tests` checks those.

`ConformanceLogs` reads the logs with `CommandLog`, more strictly than a replayer: it refuses a key the format doesn't
define, a `level` beside a `save`, a `saveVersion` beside a `seed`, a `save` without its `saveVersion`, and a log with
no checkpoint. `LogReplayTests` replays every log in the directory
through `LogReplay`, as the headless runner replays one: from a new city on the seed's map, at the log's level and
medium speed, or from its save, upgraded from its `saveVersion`, it applies each step's commands through `Simulation.ApplyCommands`, checks the step's
checkpoints, then takes the step. A difference names the first checkpoint whose state hash differs, the step at which
the log has a paused city step, or city time that fell behind the steps. A command's result is held by
`commands.json`, since a checkpoint can't tell one rejection from another. `dotnet run --project
server/Micropolis.Headless -- --log conformance/logs/<name>.log.json` replays one.

### saves/

Each fixture's saved state (`docs/state-hash.md`), from its log's replay (`FixtureSaves`): `<fixture>.built.json` at
its first checkpoint, as its log builds it, and `<fixture>.run.json` at its last, after its run. Each file is the
canonical text alone, with no final newline, so its SHA-256 is the state hash, which `FixtureSavesTests` checks
against the log's checkpoints. The C# tests start cities from them, the fixtures `Fixtures.cs` lists
(`ConformanceSaves`), and so does the benchmark (`server/Micropolis.Benchmarks`), from each `<fixture>.run.json`, the
headless runner's `--fixture`, from the fixture's `<fixture>.built.json`, and the tool's `runs.json` and
`speedGate.json`, from the built saves.

### events/

`<log>.events.json`: every event the city emits as each log of `logs/` is replayed, to its last step, in the order
emitted (`FixtureEvents`), one to a line: the `step` it came in, its `name` and its `payload`, which an event emitted
without one leaves out, written as the protocol writes the payload's type (`RulesEvents` declares each), so a state
message comes with its `type` first. A state hash never sees an event, so these pin what the players are told: the
news, the advisors' messages, the command results and every record the city publishes.

### commands.json

Commands applied to a city, each with the result the simulation gave it, which checkpoint hashes can't tell apart:
`CommandCases` lists the commands, and `CommandCasesFile` applies them. Each of `cases` holds a `description`; the city
the commands apply to, the built save of a `fixture` (`saves/<fixture>.built.json`), or a `state` it holds, a new city
on a small blank map; `results`, each command's result in the order applied, as `COMMAND_RESULT` carries it
(`player`, `command` as it arrived, `outcome` and `reason`); and `hash`, the state hash of the city after them all.

The cases reach every reason `CommandReader` rejects a command for and every outcome, and the tool fails unless they
do. The small map's longest command (`CommandReader.MaxCommandLength`) is short enough to list one either side of
it, with characters `JSON.stringify` escapes, in a type and in a key, and numbers it writes as `Number::toString`
does. The commands are
any JSON, a key that is a lone surrogate included, so the tool reads each command's text as `JSON.parse` does
(`JsonText`). Each
disaster the player can trigger is a case of its own, so its hash shows what that disaster did.

### queries.json

What the simulation answers to queries, and the records it produces, over the fixtures' saves: `QueryCasesFile` lists
the queries and asks them. `categories` is what the query tool calls each tile value, from 0. `growthOutlooks` and
`growthBlockers` are the codes of a zone's growth in a tile report, in the order a report lists blockers, which
`test/vocabulary.ts` holds the client's lists to. Each of `records` has a `city`, the name of a save of `saves/`
(`<fixture>.<point>`) or `{"seed", "level"}` for a new city on that seed's map at that level; `commands`, applied to
the city in order before its records are taken, as they would arrive from a player; and the `evaluation`, `budget`
and `settings` records the city then produces. The new city reaches what the fixtures never do: the hardest level,
disasters on, auto-budget off and the game paused. Each of `answers` holds a `query` and its `answer`, about the city
of the `save` it names, with its funds replaced by `funds` where an answer has one, or asked before any city has
started where `save` is null: in each save, a tile report at the city's centre, at the first tile of each category no
save before it reported, and at the centre of the first zone whose growth meets an outlook, a blocker or a want of a
road at its edge that no save before it reported, and budget forecasts with no service, every service and one service
named, at the lowest and the highest tax rate, and at a tax rate with a service named; the same forecasts on the
first save whose year end has no cash for its services, with half of what they cost and exactly what they cost, so the
funds pay some services and scale one back; each overlay layer from the first save where it holds a value other than
0; and queries the simulation rejects, on the first save and before any city has started. The tool fails unless the
queries reach every reason the simulation rejects one for, every category, every layer, the growth of each kind of
zone, every outlook, a zone with no road at its edge and one held back by more than one thing. A map preview's answer
is the map the seed generates, which `maps.json` holds.

### speedGate.json

The steps at which each running speed lets a phase through (`SpeedGateFile`): the city of `fixture` from its built
save, run for `steps` steps at each speed, with the step counter it starts from (`speedCycle`) and the steps, counted
from 0, that ran a phase (`phaseSteps`). The run passes the counter's wrap from 1023 to 0, which shifts the slow and
medium gates, and the tool fails unless it does.

### runs.json

Cities run at speeds and on maps the fixtures' logs never take (`RunsFile`), with the state hash every `every` steps
for `steps` steps, as long as a fixture's run. How often the late phases of the cycle run depends on the speed, so a
rule those phases hold behaves differently at each: each of `runs` is a fixture's city as built, at each running speed
it isn't saved at, or a new city on a `seed`'s map at a `level`, at every running speed, one seed for each kind of land
the map generator lays.

### maps.json

What `MapGenerator` generates from the map stream of each seed (`MapsFile`):

- `seeds`: each seed, the `kind` of land the generator laid (`island`, an island with no river; `nakedIsland`, an
  island coast with rivers and lakes; `land`, rivers and lakes on open land; `landAfterIslandDraw`, the same after
  the extra draw that decided against an island), how many `lakes` it drew, and the SHA-256 of the canonical text of
  the `map` object a save holds. The seeds are the first, counting from zero, that cover three maps of each kind, a
  map with rivers and no lakes and one with the most lakes, and the largest seed. The tool fails if the first 10000
  seeds don't cover them.
- `maps`: the whole `map` object of the first seed of the island, naked island and land kinds, with its tiles one row
  per line, so a mismatch can be located.

### helpers.json

What the helpers the tile handlers share answer, which a state hash shows only where a fixture happens to reach them
(`HelpersFile`): `valuePredicates` and `zonePredicates`, each predicate of `TileUtils` that reads a tile value, or a
zone's centre given the zone flag, as a character per value, `1` where it holds; `checkZoneSize` and `checkBigZone`,
each value's answer from `ZoneUtils`; `zones`, each zone centre of the fixtures' saves, with the population its own
kind of zone counts, the first road or rail on its perimeter clockwise, and its land value less its pollution as a
category; and `boatDistances`, a ship's distance from tiles near and far.

### ruleConstants.json

The rules' numbers the client draws by or its tests count with, which the client takes from here rather than copying
(`RuleConstantsFile`, read through `test/helpers/ruleConstants.ts`): `stepsPerCityTime` at each running speed,
`cityTimesPerYear`, `stepsPerSecond`, the steps a hosted city takes a second, and `departureInterval`, the steps of
the step clock between a station's departures, by which the client times its trains, `toolCosts`, the
`advisorConditions` in the order the status record lists them, and the `spriteTypes`, each numbered as the state
messages number it, with its frames, which `test/vocabulary.ts` holds the client's sprite sheet to,
`fireCoverBlockSize`, the block size of the fire department's cover map, by which the end-to-end runner reads a save's
cover, and `mapSize`, the map's width and height in tiles, which the world grass's field covers: `test/vocabulary.ts`
holds the client's `GRASS_MAP` to it, and the art build's `grass.py` reads it.

### migrated/

`migrated/<sample>.json` is the state each sample of `saveVersions/` loads to, `SavedGame.Load` migrating it to the
current version, as the canonical text the loaded city saves (`MigratedSaves`). `SavedGameTests` checks that each
sample still loads to it, so a migration step that changes what an old save becomes is a diff here.
