# Command logs

A command log records a city's session: where the city started, every command it was sent, and the state hashes it
reached along the way. Replaying a log reproduces the city, so logs are the end-to-end suite and the conformance
suite (`CLAUDE.md`, Direction 3): replayed headless and in the browser while the TypeScript simulation exists, and on
the server after. `src/commandLog.ts` reads and writes them, and `headless/runner.ts` replays them. In C#,
`CommandLog` and `LogReplay` in `server/Micropolis.Rules` read, write and replay them: the C# headless runner replays
any log, and the game-rules tests every log under `conformance/logs/` (`conformance/README.md`).

## The file

A log is a JSON object:

| Key | Value |
|-----|-------|
| `formatVersion` | `1` |
| `seed` and `level` | The city starts as a new game: the map the game seed generates, the seed's simulation stream, the level (0 easy, 1 medium, 2 hard) and medium speed |
| `save` | Or: the city starts from this saved state, as `Simulation.save` writes it (`docs/state-hash.md`) |
| `description` | Optional: what the log is for, in words. Replay ignores it |
| `entries` | The commands, in the order they were applied |
| `checkpoints` | The state hashes to check, in order of step |

A log has exactly one of `seed` and `save`, and a `level` only with a `seed`. It holds no other key: `parseLog` and the
C# `CommandLog` ignore one, and a `level` beside a `save`, while the C# tests' reader of the conformance logs refuses
both. A log that builds on a fixture starts
from the fixture's built state, `conformance/saves/<name>.built.json`, as its `save`.

The format version covers the file and the commands it holds: a change to the file's keys, or to the commands, their
fields or what they accept, is a new version, since a replayer of the old one would read the log differently. A
change to a game rule is not: the commands mean the same, and the checkpoints the rule moves say so.

### Entries

Each entry is `{"step", "player", "command"}`:

- `step` is the index of the step the command preceded: the number of steps the city had taken since the log began
  when the command applied. Steps are counted as the simulation takes them, so a paused city, which never steps,
  stays on the same index however long it is paused. Entries are in order of step, and entries with the same step
  are in the order they applied.
- `player` is the id of the player who sent it, a string. Single player has the one player, `"local"`. The
  simulation never branches on the player.
- `command` is the command as it arrived. `src/protocol.ts` defines the commands, and `src/commands.ts` how they are
  validated. A log holds every command the city was sent, rejected ones included: a rejected command changes nothing,
  and a replay rejects it again, which checks that the validation agrees. A command nesting objects and lists deeper
  than `MAX_COMMAND_DEPTH`, or longer than `maxCommandLength` allows, room for a tool command over every tile of the
  map, is rejected before anything else is read, which bounds an entry.

The commands, by `type`, with what their fields mean. `Command` in `src/protocol.ts` gives their exact fields,
`commandRejection` in `src/commands.ts` the values each accepts, and `protocol/examples/commands/` an example of each.

| `type` | Fields |
|--------|--------|
| `tool` | `tool`, the tool; `path`, the tiles it is applied at, in order; `autoBulldoze`, the sending player's setting |
| `setBudget` | `tax`, the tax rate in percent; `road`, `fire` and `police`, for the services it names, each one's funding in percent of what it needs. A service it leaves out keeps its funding |
| `setSpeed` | `speed`: 0 paused, 1 slow, 2 medium, 3 fast |
| `setAutoBudget` | `on`: whether the budget is set automatically |
| `setDisasters` | `on`: whether random disasters happen |
| `triggerDisaster` | `kind`: the disaster |
| `addFunds` | none: the debug menu's grant of funds |

### Checkpoints

Each checkpoint is `{"step", "hash"}`: the state hash (`docs/state-hash.md`) of the city after `step` steps and after
every command stamped with `step`, which is the city just before it takes step `step`. No two checkpoints share a
step.

## Replay

Start the city as the log says. Then, for each step index from 0: apply the entries stamped with it, in order; check
the checkpoints at it; and take one step, unless the index is the log's last, the greater of its last entry's step
and its last checkpoint's. A log that has a paused city take a step was not written by the game, and its replay
fails.

## Where logs come from

- **The browser.** With `?debug=1`, the debug window downloads the session's log. A new game's log starts from its
  seed and level, and a loaded game's from the state it loaded. The game takes a checkpoint every 3,600 steps, a
  minute of play, from step 0, and one more of the city as the log is downloaded. A browser offers the Web Crypto
  the hash needs only to a page served over https or from localhost; elsewhere the log downloads without
  checkpoints, and the game says so.
- **Fixtures.** Each fixture in `headless/fixtures/` is a log whose checkpoints are its golden hashes: one at step 0,
  of the city as its log builds it, and one after a fixed run. A fixture that needs what no command places starts
  from a save instead: the city another fixture's commands build, with its script's writes. `npm run fixtures`
  exports each as `headless/fixtures/export/<name>.log.json`, and `npm run conformance` writes those the C# replays
  to `conformance/logs/`, which `server/Micropolis.Headless` writes the same from the C# rules (`conformance/README.md`).
- **The end-to-end playthrough.** The runner downloads each session's log from the debug window and joins them into
  one from the seed (`joinSessions`): a session that loaded the save the one before it ended on carries on its steps,
  with no entry for the load. A joined session may apply no command before its first step: the joined log takes its
  city there for the city as loaded, which such a command would have changed. `e2e/goldenPlaythrough.json` holds the
  log, beside each stage's step, the number of the log's entries before it and its hash, and every run's log must be
  that one. A stage may end partway through a step's commands, before those the next stage applies first, so its hash
  is not a checkpoint of the log: `test/playthroughReplay.ts` replays each stage from the one before it, with the
  log's entries between the two. A run that took its log puts it in its report, `e2e-report/command-log.json`; one
  that ended at a failed stage, or couldn't join its sessions, has none. `npm run conformance` copies the golden log
  to `conformance/logs/playthrough.log.json`, which the C# replays.

`npm run simulate -- --log <file>` replays the whole log and counts its commands' outcomes. It then reports that the
checkpoints all match, or fails naming the earliest that didn't, or, for a log with no checkpoints, fails because it
verified nothing; and it prints the state hash it ended at. A log without checkpoints ends at its last command, so
its replay stops there, wherever the session went on to. `dotnet run --project server/Micropolis.Headless -- --log
<file>` does the same in C#.
