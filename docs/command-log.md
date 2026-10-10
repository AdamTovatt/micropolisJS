# Command logs

A command log records a city's session: where the city started, every command it was sent, and the state hashes it
reached along the way. Replaying a log reproduces the city, so logs are the end-to-end suite and the conformance
suite of the game rules (`CLAUDE.md`, Direction 3). `CommandRecorder` in `server/Micropolis.Server` writes the logs of
the cities on the server, and `CommandLog` and `LogReplay` in `server/Micropolis.Rules` read, write and replay them:
the headless runner replays any log, and the game rules' tests every log under `conformance/logs/`
(`conformance/README.md`). The end-to-end runner reads and joins the logs it downloads with
`test/helpers/commandLog.ts`.

## The file

A log is a JSON object:

| Key | Value |
|-----|-------|
| `formatVersion` | `2` |
| `seed` and `level` | The city starts as a new game: the map the game seed generates, the seed's simulation stream, the level (0 easy, 1 medium, 2 hard) and medium speed |
| `save` | Or: the city starts from this saved state, as `Simulation.Save` writes it (`docs/state-hash.md`), without the name and version a saved game holds beside it |
| `saveVersion` | With a `save`, and only then: the save format version the save was written in (`SavedGame` in `server/Micropolis.Rules`) |
| `description` | Optional: what the log is for, in words. Replay ignores it |
| `entries` | The commands, in the order they were applied |
| `checkpoints` | The state hashes to check, in order of step |

A log has exactly one of `seed` and `save`, a `level` only with a `seed`, and a `saveVersion` only with a `save`. It
holds no other key: `CommandLog` and the end-to-end runner's `parseLog` ignore one, a `level` beside a `save` and a
`saveVersion` beside a `seed`, while the C# tests' reader of the conformance logs refuses them all. A log that builds
on a fixture, such as a mid-run log, starts where the fixture's starts and holds the fixture's commands before its own.

The format version covers the file and the commands it holds: a change to the file's keys, or to the commands, their
fields or what they accept, is a new version, since a replayer of the old one would read the log differently. A
change to a game rule is not: the commands mean the same, and the checkpoints the rule moves say so. Nor is a change
to saved state: a log keeps its save in the version it was written in, which its `saveVersion` names.

`CommandLog` reads versions 1 and 2, and every writer writes 2. Version 1 is version 2 without `saveVersion`: its
save is read as save format version 10 (`CommandLog.VersionOneSaveVersion`), the version current when logs began to
name it. A version 1 log written while an older save version was current holds a save of that version, which this
misreads, so its replay differs or its save fails to load. The end-to-end runner's `parseLog` reads version 2 alone,
since it reads only logs the server and the runner write.

### Entries

Each entry is `{"step", "player", "command"}`:

- `step` is the index of the step the command preceded: the number of steps the city had taken since the log began
  when the command applied, a step as a checkpoint's is. Steps are counted as the simulation takes them, so a paused
  city, which never steps, stays on the same index however long it is paused. Entries are in order of step, and
  entries with the same step are in the order they applied.
- `player` is the id of the player who sent it, a string: on the server, the id the server gave the player as it
  signed in, and in a fixture's log, the one player there is, `"local"`. The simulation never branches on the player.
- `command` is the command as it arrived. `src/protocol.ts` defines the commands, and `CommandReader` in
  `server/Micropolis.Rules` how they are validated. A log holds every command the city was sent, rejected ones
  included: a rejected command changes nothing, and a replay rejects it again, which checks that the validation
  agrees. A command nesting objects and lists deeper than `MaxCommandDepth`, or longer than `MaxCommandLength` allows,
  room for a tool command over every tile of the map, is rejected before anything else is read, which bounds an entry.
  The server never logs one: it closes the connection that sent it, since the game sends none.

The commands, by `type`, with what their fields mean. `Command` in `src/protocol.ts` gives their exact fields,
`CommandReader` the values each accepts, and `protocol/examples/commands/` an example of each.

| `type` | Fields |
|--------|--------|
| `tool` | `tool`, the tool; `path`, the tiles it is applied at, in order; `autoBulldoze`, the sending player's setting |
| `walkway` | `kind`, the kind of walkway: `path`, `footbridge` or `underpass`; `path`, the ninths it is laid on, in order, on the map's grid of ninths, three across and down each tile, at most as many as the map has tiles |
| `erase` | `tool`, the tool whose work it takes off, any but the bulldozer; `path`, the tiles it erases at, in order |
| `eraseWalkway` | `path`, the ninths whose walkway it erases, in order, as the walkway command's path runs |
| `setBudget` | `tax`, the tax rate in percent; `road`, `fire` and `police`, for the services it names, each one's funding in percent of what it needs. A service it leaves out keeps its funding |
| `setSpeed` | `speed`: 0 paused, 1 slow, 2 medium, 3 fast |
| `setAutoBudget` | `on`: whether the budget is set automatically |
| `setDisasters` | `on`: whether random disasters happen |
| `triggerDisaster` | `kind`: the disaster |
| `addFunds` | none: the debug menu's grant of funds |

### Checkpoints

Each checkpoint is `{"step", "hash"}`: the state hash (`docs/state-hash.md`) of the city after `step` steps and after
every command stamped with `step`, which is the city just before it takes step `step`. No two checkpoints share a
step. A step, in a checkpoint and in an entry, is a whole number from 0 to 2^53 − 1, the largest a JSON number holds
exactly (`CommandLog.MaxStep`).

## Replay

Start the city as the log says: a save is first brought up from its `saveVersion` to the current save format version,
by the steps that upgrade a saved game (`SavedGame.UpgradeState`), so a log written before a change to saved state
replays after it. Then, for each step index from 0: apply the entries stamped with it, in order; check
the checkpoints at it; and take one step, unless the index is the log's last, the greater of its last entry's step
and its last checkpoint's. A log that has a paused city take a step was not written by the game, and its replay
fails.

## Where logs come from

- **The server.** A city on the server keeps one log of every player's commands, each entry with the id of the
  player who sent it, in the order the server received them, and the C# rules work out its checkpoints' hashes. A
  new city's log starts from its seed and level; an uploaded city's, and a city's each time the server loads it
  again, from its saved state as loaded, migrated to the current save format version whatever version it was saved
  in, which its `saveVersion` names. The server takes a checkpoint every 3,600 steps, a minute of play, from step 0, and
  one more of the city as the log is handed over. With `?debug=1`, the debug window downloads it.
- **Fixtures.** Each fixture is a log whose checkpoints are its golden hashes, which the fixture tool works out and
  writes to `conformance/logs/`, as `conformance/README.md` describes.
- **The end-to-end playthrough.** The runner downloads each session's log from the debug window and joins them into
  one from the seed (`joinSessions`): a session that loaded the save the one before it ended on carries on its steps,
  with no entry for the load. A joined session may apply no command before its first step: the joined log takes its
  city there for the city as loaded, which such a command would have changed. Its checkpoint at its first step, the
  server's hash of the city as it loaded it, must be the hash the session before it ended on, and a session without
  one is refused. `e2e/goldenPlaythrough.json` holds the
  log, beside each stage's step, the number of the log's entries before it and its hash, and every run's log must be
  that one. A stage may end partway through a step's commands, before those the next stage applies first, so its hash
  is not a checkpoint of the log: `GoldenPlaythroughTests` in `server/Micropolis.Headless.Tests` replays each stage
  from the one before it, with the log's entries between the two. The playthrough plays a city on the game server,
  which logs each command under the id of the player who sent it, a new one each time a player signs in, so the run
  names its players by when each first appears in its log, `"player 1"` first, and the golden log holds those names.
  A run that took its log puts it in its report, `e2e-report/command-log.json`; one that ended at a failed stage, or
  couldn't join its sessions, has none. The fixture tool copies the golden log to
  `conformance/logs/playthrough.log.json`, which the C# replays.

`dotnet run --project server/Micropolis.Headless -- --log <file>` replays the whole log and counts its commands'
outcomes. It then reports that the checkpoints all match, or fails naming the earliest that didn't, or, for a log
with no checkpoints, fails because it verified nothing; and it prints the state hash it ended at. A log without
checkpoints ends at its last command, so its replay stops there, wherever the session went on to.
