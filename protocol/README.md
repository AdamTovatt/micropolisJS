# Protocol

The bodies and messages between the browser and the server. Each side defines the session's bodies and messages and the
commands a player sends the simulation by hand: `src/protocol.ts` for the client and
`server/Micropolis.Rules/Protocol.cs` for the server, and the messages a player sends in `ClientMessages.cs`.
`src/protocol.ts` also defines the queries with their answers, the records the simulation produces for the windows to
show, and the state messages the city sends the client; the server defines those it writes, the answers in
`QueryAnswers.cs` and the records and state messages in `StateMessages.cs`, and reads a query by validating it
(`Queries.cs`). The examples and reader cases here pin the sides together.

## Transport

- `POST /api/session` with `{"name"}` signs a player in under a new player id. It answers `{"token", "name"}`, where
  `token` is a JWT that lasts 30 days and `name` is the name as the server keeps it, trimmed: the browser stores that
  name and signs in with it again when the token is rejected. The player learns their id from the socket's `hello`.
  It answers with `{"error"}`, a reason to show the player, and 400 when the body is not a sign-in or the name breaks
  the rule below, 413 when the body is longer than any sign-in, and 429 when one client address signs in more than 10
  times in a minute.
- `GET /api/session` with the token as a bearer answers `{"playerId", "name"}` while the token is valid, and 401 when
  it is not or when there is no token. The browser asks it first, with any token it has stored, to find out whether a
  server answers: a 401 or a player is this server's answer, and anything else, such as a static host's page, means
  the game runs single-player. A token is refused from the second it expires: the server that issues tokens is the
  one that checks them, so it allows no clock skew.
- `/ws/city` is one plain WebSocket carrying one JSON message per text message, of one frame or more. The browser
  cannot set an `Authorization` header on a WebSocket, so the token travels in the `access_token` query parameter. A
  connection without a valid token is refused. The server closes a connection with status 1008 when its token expires,
  when the client falls 256 messages behind, or when the client sends something that is not a message a player sends,
  a command before it is in a city, a command longer or deeper than a command can be (see Commands), or commands
  faster than one client address may send them; with 1003 for a binary message, 1007 for text that isn't UTF-8 and 1009 for a
  message longer than 4 MiB; with 1011 when the city it is in fails; and with 1001 when the server stops. It pings
  every 15 seconds, which browsers answer on their own, and drops a connection that leaves a ping unanswered for 15
  seconds.

A display name is 1 to 32 characters, counted as UTF-16 code units as JavaScript's `length` counts them, after
surrounding whitespace is trimmed. It holds no control characters, no format characters (Unicode category Cf, such as
a zero-width space or a right-to-left override) and no line or paragraph separators. `POST /api/session` enforces it;
the browser's reader does not, since the server is the authority on what it sends.

## Messages

Every message is a JSON object whose `type` field names it. The server sends:

- `hello`: the first message on every connection. `you` is the connecting player's id and `players` lists everyone
  online, the connecting player included, in the order they came online.
- `players`: someone came online or went offline. `players` lists everyone now online, in the same order.
- `cursor`: another player in the city moved their hover box. `player` is their id, and `cursor` is the box, or null
  when it left the map, the player put their tool down, or the connection it came from left the city.
- `state`: a batch of state messages from the city the connection is in, in `messages`, in the order the city sent
  them (see State messages). Every connection in the city receives the same batches.
- `answer`: the answer to the request with the `id` given, in `value`, sent after any state the request changed.
- `failed`: why the request with the `id` given failed, in words, in `error`.

A player is `{"id", "name"}`. A player with several connections, such as two tabs signed in as one player, is listed
once, comes online with the first connection and goes offline with the last.

A player's browser sends these, each a request carrying an `id`, a whole number from 0 that the answer carries back,
but `command` and `cursor`:

- `cursor`, with `cursor`: the player's hover box, `{"tool", "x", "y", "size"}`, or null once when it goes. The box
  holds the tool the player holds, one of the tools a tool command names or `query`; the map tile under their
  pointer, where a click applies the tool; and the box's side in tiles. The browser sends it as the box moves, at most
  5 times a second, and again every 2 seconds while it holds still. The server doesn't answer it: it passes each on
  to the city's other players as a `cursor` message from the sender's player, and to nothing else, so the simulation
  never sees it and no log keeps it. It passes on at most 20 a second from one connection and drops the rest, drops a
  box whose tile is off the city's map or whose size is outside 1 to 6, the airport's, and passes on nothing from a
  connection in no city, all without failing or closing the connection; one that isn't a `cursor` message at all is
  as any other message a player sends that the server can't read. When a connection that sent a box leaves its city,
  the server passes on null for it. A browser drops another player's box 5 seconds after the last `cursor` message for
  it, and when its player goes offline; its reader checks the kinds of a box's values, not their ranges, which are the
  server's to check.

- `start`, with `name`, `seed` and `level`: starts a new city on the server, on the map the seed generates, at the level
  by its number in `GAME_LEVELS`, under a new id, and joins it.
- `upload`, with `save`, a saved game's text: starts the city the save holds on the server, under a new id, and joins
  it. The city the save came from is untouched: the upload is a copy.
- `join`, with `city`, a city's id: joins the city, which any signed-in player may. A city's id is 32 lower-case
  hexadecimal digits.
- `command`, with `command`: a command (see Commands) for the city the connection is in. The server doesn't answer it:
  what came of it is a `commandResult` state message, which every player in the city receives.
- `query`, with `query`: a query (see Queries). The answer is the query's answer. Before the connection is in a city,
  a map preview is answered and any other query rejected.
- `save`: the answer is the city's saved game's text, as the game saves one.
- `commandLog`: the answer is the city's session log, `{"log", "step", "unhashed"}`: the log (`docs/command-log.md`)
  since the server last started or loaded the city, the steps the city has taken since, and `null`, since the server
  always works out its checkpoints' hashes.
- The debug channel, which only a Debug build of the server answers (`dotnet build` or `dotnet run`; `dotnet publish`
  builds Release), and others fail: `hold` holds the step driver of the city the connection is in, and of each city it
  starts or joins after, until a `release`, so that the city steps only when `advance`d; `release` lets the city the
  connection is in step again, and leaves each it joins after as other players hold it or not; `flush` applies the
  commands sent so far; `advance`, with `steps`, applies them and takes that many steps, and is answered with
  `{"steps", "budgetReviewDue", "error"}`, where `error` says why it took fewer steps than asked, or none (the steps
  aren't a whole number from 0, the driver isn't held, or the city isn't stepping), or why city time fell short of the
  steps taken, and is null otherwise: an advance that goes wrong is still answered, not failed;
  `cityTime` is answered with the city's time; and on a server whose cities run on a clock only the debug channel
  moves, `turn`, with `milliseconds`, moves the city's clock on and has it take a turn of its loop if one is due, and
  fails in a city on the server's clock. Each but `advance` and `cityTime` is answered with null.

`save`, `commandLog`, `flush`, `advance`, `cityTime` and `turn` fail with "No city has started" before the connection
is in a city; `hold` and `release` then answer null and apply to the city it starts or joins next.

A city's name is 1 to 15 characters, counted as a display name's are but not trimmed, and holds none of the
characters a display name can't. A `start` whose name breaks the rule fails, and so does an `upload` of a save whose
name does, a save that won't load, a `join` of a city that doesn't exist or whose save won't load, any of them when
the server can't reach the store it keeps its cities in, and a `start` or an `upload` past the cities one client
address may start in ten minutes. Each of those leaves the connection in the city it was in. A city that fails as the
connection joins it fails the request with the connection in no city.

The answer to `start`, `upload` and `join` is `{"city", "name", "seed"}`: the city's id, its name and its game seed. It
comes after the city's whole state, sent as one `state` batch: the whole map, the sprites, the date, the population,
the records, and the latest `status` and `demand` the city has published, if it has. A connection is in at most one
city: starting or joining one leaves the one before. Every connection's commands go into the city's one command stream
in the order the server receives them, apply between steps, and are logged in the city's one log with the id of the
player who sent each; the simulation never branches on who sent one. A city steps whether or not anyone can see it,
while any player is in it; when the last leaves, the server saves it and unloads it, and a join loads it again. A city
whose rules throw is unloaded without saving, so it stays as it was last saved, and every connection in it is closed
with 1011.

Readers are strict: an unknown field, a missing one, or a null or a value of the wrong kind where the protocol has
none is an error. Fields may come in any order, `type` included, and writers put them in the protocol's order. The
browser's reader checks a batch's messages only to be state messages, by their type, and takes an answer's value as
the request expects it: the examples pin both on both sides.

## Commands

A command is one change a player makes to the city: a JSON object whose `type` field names it. `src/protocol.ts` and
`server/Micropolis.Rules/Protocol.cs` define each command's fields, and `docs/command-log.md` says what they mean. The
simulation validates each command as it receives it (`src/commands.ts`, and `CommandReader` in C#), and rejects one
with a field missing, a field the command doesn't have, or a value of the wrong kind or outside the range the game
offers, giving the same reason on either side. Fields may come in any order, and writers put them in the protocol's
order. A command is any JSON a player sends, read as `JSON.parse` reads it, so the C# reads one with `JsonText`, which
takes a key or string holding a lone surrogate, keeps the last value of a key written twice, and puts the keys that
are array indices first, as `JSON.parse` does. A command nesting objects and lists more than 64 deep, or longer than
a tool command over the whole map, is rejected before anything else is read; the server never takes one from a
player, and closes the connection that sends one, since the game sends none. `JsonText` reads text nested at most
1,000 deep and throws on deeper text, which `JSON.parse` reads, so the C# takes text nested deeper than that as no
JSON at all rather than as a command to reject.

## Queries

A query asks the simulation about the city and changes nothing: a JSON object whose `type` field names it.
`src/protocol.ts` defines each query and its answer. The simulation validates each query as it receives it
(`src/queries.ts`, and `Queries` in C#) and answers a rejected one with `{"type": "rejected", "reason"}`, giving the
same reason on either side. A query is never logged as a command, since replaying it would change nothing.

- `overlay` names a `layer`, one of the maps the simulation computes, and is answered with the layer's values in
  blocks: `blockSize`, the tiles a block covers along each side; `width` and `height`, the blocks across and down;
  `low` and `high`, the ends of the layer's range; and `values`, row by row, top row first. A block in the last
  column or row may reach past the map's edge. A value may pass an end of the range where the original's rules let
  it, such as the police or fire coverage of several stations in one block.
- `tileReport` names a tile by `x` and `y`, which must be on the map, and is answered with what the query tool reports
  about it, as raw values: `x` and `y`; `tile`, the tile's value without its flags; `category`, what the query tool
  calls the tile, one of the codes `src/protocol.ts` lists; `populationDensity`, `landValue`, `crime`, `pollution`
  and `rateOfGrowth`, read from the blocks covering the tile; and the values the query tool shows in debug mode: the
  tile's flags, `burnable`, `bulldozable`, `conductive`, `animated`, `powered` and `zoneCentre`, and from the blocks
  covering the tile, `fireStationMap`, `fireCoverage`, `policeStationMap`, `policeCoverage`, `terrainDensity`,
  `trafficDensity` and `cityCentreScore`. A station map is the simulation's working map of a service: cleared as each
  cycle starts, then added to by the map scan, which adds the funded effect of each station it finds, halved for a
  station without power and again for one without a road beside it, to the block of the road tile beside it that the
  zones' perimeter search finds first, or of the station when it has none. When the service's analysis runs, it
  smooths the station map into the coverage and leaves its middle step of smoothing in the station map. The answer
  carries no display text: the client sorts the values into the bands it shows.
- `budgetForecast` may name `road`, `fire` and `police`, each a whole percent from 0 to 100 of what that service
  needs, as `setBudget` does, and is answered with `budget`, the budget now as a `budget` record (see Records), and
  what the year end would do if it came now, from those funds and that tax collection, with each service named at
  that funding and the others at the funding they have: `costs`, what each service would cost, as
  `{"road", "fire", "police"}`; `fundsChange`, the taxes less what the services would be paid; and `fundsAfterYear`,
  the funds it would leave. One answer holds everything a forecast is worked out from, taken at one moment.
- `mapPreview` names a game `seed`, a uint32, and is answered with the map a new city on that seed starts on: `seed`;
  `width` and `height`, in tiles; and `tiles`, each tile's raw value with its flags, row by row, top row first, as the
  `map` state message holds them (see State messages). It is
  the only query answered before any city has started, which the splash screen asks to show the maps a player chooses
  from; a query about a city asked before one has started is rejected.

The `overlayUpdated` state message (see State messages) announces that a layer was recomputed.

## Records

A record is what the simulation says about the city for a window to show: a JSON object whose `type` field names it.
It carries codes and numbers, never display text: the client turns the codes into text, so the wording is the
client's alone and the server only has to reproduce the data. `src/protocol.ts` defines each record's fields and the
codes it uses.

- `evaluation` is the city's evaluation, as the evaluation window shows it: `approval`, the percentage of the public
  who think the mayor is doing a good job; `problems`, the ids of the worst problems, worst first, at most four, each
  one some of the public voted for; `population` and `migration`, its change since the last census; `assessedValue`;
  `cityClass`; `level`, the game's difficulty; `score` and `scoreDelta`, its change since last year; and
  `scoreBreakdown`, the steps that moved the score last year, in order, each a `reason` and the `points` it moved the
  score by. The breakdown is empty until the city's next yearly score after a new city or an old save migrated from
  before the breakdown was kept; otherwise its points sum to `scoreDelta`.
- `budget` is the budget, as the budget window shows it: `taxRate`, in percent; `taxesCollected`, what the last tax
  collection brought in; `funds`, the funds now; and `maintenance` and `funding`, each `{"road", "fire", "police"}`:
  what each service needs a year, and its funding, 0 to 1 of what it needs. The year end may scale a funding back to
  the cash there was, which leaves it a fraction of a percent; a player only sets whole percents. A funding is a
  single-precision float, as the original keeps it, written as the double it widens to.
- `settings` is the city's settings, as the settings window shows them: `autoBudget` and `disasters`, whether each is
  on, and `speed`, the speed the city runs at as `setSpeed` sets it, 0 when paused. The settings a client keeps for
  itself, such as auto-bulldoze, are not part of it.

## State messages

A state message is what the city sends the client about itself: a JSON object whose `type` field names it. The client
shows the city from these and nothing else, through its city source (`src/citySource.ts`). It keeps its own copy of
the map, built from the full map the city sends when it starts, and kept up to date by the tile changes after it. The
city sends what changed in batches, after the steps: one after each turn of its loop that applied commands or took
steps, however many steps the turn took, and one after each call of the end-to-end runner's driver that applies
commands or takes steps. The sprites, the date, the population and the records go only when they differ from what it
sent last. The simulation publishes `status` and `demand` each cycle, and a batch carries only the latest of each it
published since the batch before. A batch announces each recomputed layer at most once in `overlayUpdated`, however
often the turn recomputed it. The events, `news`, `commandResult`, `budgetReviewDue` and `overlayUpdated`, go in the
order they came. A city that starts sends the whole map, the sprites, the date, the population and the `evaluation`,
`budget` and `settings` records (see Records), then the rest as they come.

- `map` is the whole map: `width` and `height`, in tiles, and `tiles`, each tile's raw value with its flags, row by
  row, top row first.
- `tiles` lists the tiles whose raw value changed since the last `map` or `tiles` message, in `changes`, each
  `{"x", "y", "value"}`.
- `sprites` lists every sprite on the map, in `sprites`, each `{"type", "frame", "x", "y", "width"}`: its type, which
  is its row of the sprite sheet, and its frame, its column, both counted from 1; and the square it is drawn in,
  `width` map pixels a side with its top-left corner at map pixel (`x`, `y`). A map pixel is a sixteenth of a tile.
- `date` is the city's date: `month`, from 0, and `year`.
- `population` is the city's `population` as the last monthly growth check counted it. The `evaluation` record's
  population is the yearly evaluation's.
- `status` is the conditions that limit the city's growth: `powerCapacity` and `powerLoad`, as of the
  last power scan; `residentialCapped`, `commercialCapped` and `industrialCapped`, whether that demand is held at zero
  for want of a stadium, airport or seaport; and `conditions`, the advisor conditions that hold, each named by its
  message.
- `demand` is the demand for each zone as the demand valves last set it: `residential`, from -2000 to
  2000, and `commercial` and `industrial`, from -1500 to 1500.
- `news` is a message for the player: `subject`, its message, and `data`, where it happened, when it happened
  somewhere: `{"x", "y"}` in tiles, with `"showable": true` for a place the monster TV shows, or `"trackable": true`
  and `sprite`, the type of the sprite there for the TV to follow, a monster or a tornado, of which the map holds at
  most one each.
- `commandResult` is what came of a command, any player's, in `result`: `player`, who sent it; `command`, as it
  arrived; `outcome`, one of `ok`, `failed`, `noMoney`, `needsBulldoze` and `rejected`; and `reason`, why it was
  rejected, or null.
- `budgetReviewDue` says that the year end paid the budget with values the player should review: auto-budget is off,
  or couldn't cover the services. The city steps on: nothing waits for the review.
- `overlayUpdated` names a `layer` the simulation has recomputed, which an overlay showing it asks for again.

## Examples

Each file in `examples/socket/` is one WebSocket message the server sends, each file in `examples/client/` one a
player's browser sends, each file in `examples/session/` is one body of `/api/session`, named after the body, each
file in `examples/commands/` is one command, and each file in `examples/queries/` is one query. An example is its exact
wire text on one line, then a newline, in UTF-8 without a byte order mark. Each side's tests read every example of
what that side reads or writes, deserialize it into their own types and serialize it back, and fail unless the bytes
are identical, so a field renamed, added or dropped on one side turns that side red. Each side reads back every example of a body, message, command or query it reads, and
writes back every example of one it writes, building it from the example's fields where it has no reader for it. The
simulation reads a command or a query by validating it, so such an example must also be one it accepts. Each side's
tests also fail when a message type, a session body, a command type or a query type that side reads or writes has no
example. The browser writes a message of `examples/client/` as an object literal, so its tests check that the
WebSocket source writes each with the example's fields, in order, and the server's read each and write it back.

Each file in `examples/records/` is one record, named after its type. The client's tests write each one back through
the simulation's own code, from the example's fields, and the server's write each back from its C# type, and both fail
on a record type with no example.

Each file in `examples/answers/` is one answer to a query, named after its type. The client's tests check its shape,
as they check a state message's below, against what the simulation answers, and the server's write each back from its
C# type to the same bytes. Both fail on an answer type with no example.

Each file in `examples/state/` is one state message other than a record, named after its type, with more than one
for a message that comes in more than one shape. The client's tests check its shape, not its bytes: that the city host
(`src/cityHost.ts`) writes each with the example's field names, in the same order, each with a value of the same
kind. The server's tests write each back from its C# type to the same bytes. Both fail on a state message type with no
example among these and the records.

`reader-cases.json` holds the messages both readers must reject, messages they must accept and write back in the
protocol's order, and session bodies a reader must reject, each tested by the sides that read that body.

The two serializers write the letters, digits, punctuation and symbols of every script as they are. They write
differently only characters that System.Text.Json escapes and `JSON.stringify` does not: every character outside the
Basic Multilingual Plane (emoji among them), private-use and unassigned code points, spaces other than U+0020, U+2028,
U+2029, U+FEFF and the control characters, where `JSON.stringify` escapes only the C0 controls and in lower-case hex.
Both are valid JSON for the same text, so they differ in bytes only, and the examples hold none of these characters.
The server writes a number with a fraction as `JSON.stringify` does, with its exponent in the same form.
