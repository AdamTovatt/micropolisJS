# Protocol

The bodies and messages between the browser and the server, defined by hand on each side: `src/protocol.ts` for the
client and `server/Micropolis.Rules/Protocol.cs` for the server, and the commands and queries a player sends the
simulation, with the queries' answers, the records the simulation produces for the windows to show, and the state
messages the city sends the client, defined in `src/protocol.ts`. The examples and reader cases here pin the sides
together.

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
- `/ws/city` is one plain WebSocket carrying one JSON message per text frame. The browser cannot set an
  `Authorization` header on a WebSocket, so the token travels in the `access_token` query parameter. A connection
  without a valid token is refused. The server closes a connection with status 1008 when its token expires or when
  the client falls 256 messages behind, and with 1001 when the server stops. It pings every 15 seconds, which browsers
  answer on their own, and drops a connection that leaves a ping unanswered for 15 seconds.

A display name is 1 to 32 characters, counted as UTF-16 code units as JavaScript's `length` counts them, after
surrounding whitespace is trimmed. It holds no control characters, no format characters (Unicode category Cf, such as
a zero-width space or a right-to-left override) and no line or paragraph separators. `POST /api/session` enforces it;
the browser's reader does not, since the server is the authority on what it sends.

## Messages

Every message is a JSON object whose `type` field names it. The server sends:

- `hello`: the first message on every connection. `you` is the connecting player's id and `players` lists everyone
  online, the connecting player included, in the order they came online.
- `players`: someone came online or went offline. `players` lists everyone now online, in the same order.

A player is `{"id", "name"}`. A player with several connections, such as two tabs signed in as one player, is listed
once, comes online with the first connection and goes offline with the last.

Readers are strict: an unknown field, a missing one, or a null or a value of the wrong kind where the protocol has
none is an error. Fields may come in any order, `type` included, and writers put them in the protocol's order.

## Commands

A command is one change a player makes to the city: a JSON object whose `type` field names it. `src/protocol.ts`
defines each command's fields, and `docs/command-log.md` says what they mean. The simulation validates each command as
it receives it (`src/commands.ts`), and rejects one with a field missing, a field the command doesn't have, or a value
of the wrong kind or outside the range the game offers. Fields may come in any order.

## Queries

A query asks the simulation about the city and changes nothing: a JSON object whose `type` field names it.
`src/protocol.ts` defines each query and its answer. The simulation validates each query as it receives it
(`src/queries.ts`) and answers a rejected one with `{"type": "rejected", "reason"}`. A query is never logged as a
command, since replaying it would change nothing.

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

Each file in `examples/socket/` is one WebSocket message, each file in `examples/session/` is one body of
`/api/session`, named after the body, each file in `examples/commands/` is one command, and each file in
`examples/queries/` is one query. An example is its exact wire text on one line, then a newline, in UTF-8 without a
byte order mark. Each side's tests read every example of what that side reads or writes, deserialize it into their
own types and serialize it back, and fail unless the bytes are identical, so a field renamed, added or dropped on one
side turns that side red. Each side reads back every example of a body, message, command or query it reads, and
writes back every example of one it writes, building it from the example's fields where it has no reader for it. The
simulation reads a command or a query by validating it, so such an example must also be one it accepts. Each side's
tests also fail when a message type, a session body, a command type or a query type that side reads or writes has no
example.

Each file in `examples/records/` is one record, named after its type. The client's tests write each one back through
the simulation's own code, from the example's fields, and fail on a record type with no example.

Each file in `examples/state/` is one state message other than a record, named after its type, with more than one
for a message that comes in more than one shape. The client's tests check its shape, not its bytes: that the city host
(`src/cityHost.ts`) writes each with the example's field names, in the same order, each with a value of the same
kind. They fail on a state message type with no example among these and the records.

`reader-cases.json` holds the messages both readers must reject, messages they must accept and write back in the
protocol's order, and session bodies a reader must reject, each tested by the sides that read that body.

The two serializers write the letters, digits, punctuation and symbols of every script as they are. They write
differently only characters that System.Text.Json escapes and `JSON.stringify` does not: every character outside the
Basic Multilingual Plane (emoji among them), private-use and unassigned code points, spaces other than U+0020, U+2028,
U+2029, U+FEFF and the control characters, where `JSON.stringify` escapes only the C0 controls and in lower-case hex.
Both are valid JSON for the same text, so they differ in bytes only, and the examples hold none of these characters.
