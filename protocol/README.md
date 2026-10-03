# Protocol

The bodies and messages between the browser and the server, defined by hand on each side: `src/protocol.ts` for the
client and `server/Micropolis.Rules/Protocol.cs` for the server, and the commands and queries a player sends the
simulation, with the queries' answers, and the records the simulation produces for the windows to show, defined in
`src/protocol.ts`. The examples and reader cases here pin the sides together.

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

The protocol has no message announcing that a layer was recomputed. In the page, the simulation announces it with the
`OVERLAY_UPDATED` event (`src/messages.ts`), which is not part of the wire format.

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

`reader-cases.json` holds the messages both readers must reject, messages they must accept and write back in the
protocol's order, and session bodies a reader must reject, each tested by the sides that read that body.

The two serializers write the letters, digits, punctuation and symbols of every script as they are. They write
differently only characters that System.Text.Json escapes and `JSON.stringify` does not: every character outside the
Basic Multilingual Plane (emoji among them), private-use and unassigned code points, spaces other than U+0020, U+2028,
U+2029, U+FEFF and the control characters, where `JSON.stringify` escapes only the C0 controls and in lower-case hex.
Both are valid JSON for the same text, so they differ in bytes only, and the examples hold none of these characters.
