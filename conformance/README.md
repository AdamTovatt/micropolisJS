# Conformance data

Data that the C# implementation of the game rules tests against, read from here rather than copied: the random
stream's vectors, which the TypeScript tests read too, and files the TypeScript reference writes.

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
`saves/`, `helpers.json`, `speedGate.json` and `snapshots/` from the TypeScript game rules. Regenerate them in the
commit that changes what they are computed from:

```bash
npm run conformance
```

A file it no longer writes is gone after it runs. CI runs it too, and fails unless the committed files are what it
writes. The generator rewrites a gzipped snapshot file only when the text it holds changes, so an unchanged file keeps
its committed bytes whatever another zlib would write. The server's tests only read them.

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
log (`headless/fixtures/`) is replayed: `<fixture>.built.json` at its first checkpoint, as its commands build it, and
`<fixture>.run.json` at its last, after its golden run. Each file is the canonical text alone, with no final newline,
so its SHA-256 is the state hash, and the generator fails unless the replay matches the fixture's golden hashes up to
that checkpoint. `checkpoints.json` lists the step of each fixture's built and run checkpoints.

### helpers.json

What the helpers the tile handlers share answered in the TypeScript:

- `valuePredicates`: each predicate of `src/tileUtils.js` that reads a tile's value, with a character per tile value,
  `1` where it holds; `zonePredicates`, the same for those that read a zone's centre, given a tile with the zone flag.
- `zones`: each zone centre in the sprite-free fixtures' saves (`fixture`, `point`, `x`, `y` and its `value`): the
  `population` its own `kind` of zone counts, for a residential, commercial or industrial zone, and the
  `perimeterRoad` `Traffic.findPerimeterRoad` finds, or `null`. The generator fails unless they cover an empty
  residential zone, a commercial and an industrial zone, and a zone with no road on its perimeter.
- `repairs`: each zone centre of `repairFixture`'s built save, with the tiles `repairDamage` gives, relative to the
  centre, overwritten, then checked by the repair manager at a `cityTime`: whether it `repaired` anything, and the six
  by six tiles from the centre's upper left neighbour after it (`area`), as raw values row by row. The generator fails
  unless a zone is repaired and a zone is left for another time.
- `sprites`: a fixture's save with the sprites `added` to the end of its list: the index of the sprite
  `spriteManager.getSprite` finds first of each type (`firstOfType`), or `null`, and `getBoatDistance` from tiles
  (`boatDistances`).

### speedGate.json

The steps at which each running speed lets a phase through: the city of `fixture` from its built save, run for
`steps` steps at each speed, with the step counter it starts from (`speedCycle`) and the steps, counted from 0, that
ran a phase (`phaseSteps`). The run passes the counter's wrap from 1023 to 0, which shifts the slow and medium gates.
The built save is the replay of the fixture's log to step 0, which the generator checks against the golden hash there,
as it does each city the snapshots start from.

### snapshots/

Unit snapshots: calls of the simulation's units of work, each with the saved state before and after it and the events
it emitted, so the C# port proves each unit on its own. `unitSnapshots.ts` records them, and `snapshotPoints.ts` says
which calls.

#### Units and their names

A unit is a function the cycle calls, keyed in `UNITS` in `unitSnapshots.ts`, and named by its module and function as
`src/` names them: `census.take10Census`, `blockMapUtils.crimeScan`, `simulation._sendMessages`.
`simulation._simulate` is one pass the speed gate lets through: the city's first evaluation if it is still due, then
one phase. A handler the map scan calls is named by its family and its function, `residential.residentialFound`. A
handler family is a module that registers handlers with the map scanner and zones with the repair manager. Families
are named by their modules, `FAMILIES` in `unitSnapshots.ts` and `Simulation.HandlerFamilies` in C# list them in
`Simulation.init`'s order, and a C# test checks that order against the records. Where a unit reaches the sprites or
the disasters, the names are `spriteManager.makeExplosion` and `disasterManager.doMeltdown`.

These names are the contract between the two sides: a unit the C# has no port of is a stub that throws
`NotPortedException` with the unit's name, and a record names every unit it reached. One stub is outside it:
`spriteManager.moveObjects`, which the step loop calls and no unit does, throws for a city with sprites, and the
snapshots come from cities without them.

#### Records

Each file is `<fixture>.<unit>.json.gz`: gzip over the canonical text (`docs/state-hash.md`) of a list of records, each
an object of:

- `fixture` and `step`: the sprite-free fixture whose city made the call, run at its saved speed from its built save,
  checked against its golden hash, and the step, counted from 0, during which the call came.
- `unit` and `args`: the unit's name, and its arguments that are not simulation state. `mapScanner.mapScan`'s are its
  first column and the column after its last; every other unit's are `[]`.
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

A point names a call to record: a `fixture` of the sprite-free ones, whose city runs at its saved speed, a `unit`, and
which of its calls (`call`, counting from 0 among the calls `where` accepts, given the city as the call finds it).
`handlers` is every family when left out, or `"each"` for `mapScanner.mapScan`: one record with no handlers, and one
with each family alone whose handlers the call reaches with every family registered. `reaches` names a branch, and
tests that each record of the point reaches it.

The points seeded are, in each sprite-free fixture, the map scan's first sweep, its eight calls, with `"each"`, and
every other unit's first two calls; every phase of the suburb's first cycle; and phase 0 alone in each fixture: a
cycle that sets no valves, after the first evaluation. A point for a rare branch names the branch in `reaches`, so a change that stops the point
reaching it fails the generator rather than leaving the branch unproven.

The generator fails when:

- a fixture's city as built does not match the golden hash its log pins at step 0, or the log pins none there;
- a fixture's city creates a sprite;
- registering the families as it does registers what `Simulation.init` does differently, or a family registers
  handlers other in number or name than `FAMILIES` lists;
- an event is emitted with a `null` payload, which a record could not tell from none: emit it without one, or with an
  object;
- a call replayed from the state before it, with every family registered, does not leave the state and the events the
  city's own call did;
- a point's call is not found within 20000 steps, or a point does not reach its branch;
- a unit has no record, or the gzipped files take more than 5 MB, past which fewer points are recorded rather than
  fewer units.

#### The C# side

`UnitSnapshotTests` runs every record the index lists, through `UnitSnapshotRunner`: it loads `before` with
`Simulation.FromSave`, which registers every family as the simulation does, and registers `handlers` instead with
`Simulation.RegisterHandlers` when they are fewer. It calls the unit as the cycle does, from a table with a case per
unit name, and compares `after` key by key in the canonical text's order, then the events in order. A difference names
the first key that differs and both values, and for an entry of the tiles, a block map or the power grid, the tile's
or the block's position. A record passes when nothing differs. It is inconclusive when the run stops at a stub the
TypeScript's call reached, the unit itself or one in `reached`, and fails when it stops at any other stub: the C#
called what the TypeScript did not.

Two tests hold what is ported to passing, and fail rather than report inconclusive: every phase 0 record that reaches
no other unit, the counters and the census clearing, and every map scan record with no handlers, the scanner's core.
