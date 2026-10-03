# Protocol

The bodies and messages between the browser and the server, defined by hand on each side: `src/protocol.ts` for the
client and `server/Micropolis.Rules/Protocol.cs` for the server. The examples and reader cases here pin the two
together.

## Transport

- `POST /api/session` with `{"name"}` signs a player in under a new player id. It answers `{"token", "playerId",
  "name"}`, where `token` is a JWT that lasts 30 days and `name` is the name as the server keeps it, trimmed: the
  browser stores that name and signs in with it again when the token is rejected. It answers 400 with `{"error"}`, a
  reason to show the player, when the body is not a sign-in or the name breaks the rule below, and 429 with
  `{"error"}` when one client address signs in more than 10 times in a minute.
- `GET /api/session` with the token as a bearer answers `{"playerId", "name"}` while the token is valid, and 401 once
  it is not. A token is refused from the second it expires: the server that issues tokens is the one that checks
  them, so it allows no clock skew.
- `/ws/city` is one plain WebSocket carrying one JSON message per text frame. The browser cannot set an
  `Authorization` header on a WebSocket, so the token travels in the `access_token` query parameter. A connection
  without a valid token is refused. The server closes a connection with status 1008 when its token expires, and with
  1001 when the server stops. It pings every 15 seconds, which browsers answer on their own, and drops a connection
  that leaves a ping unanswered for 15 seconds.

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

## Examples

Each file in `examples/socket/` is one WebSocket message, and each file in `examples/session/` is one body of
`/api/session`, named after the body. An example is its exact wire text on one line, then a newline, in UTF-8 without
a byte order mark. The tests on both sides read every example, deserialize it into their own types and serialize it
back, and fail unless the bytes are identical, so a field renamed, added or dropped on one side turns that side red.
The browser only writes a sign-in, so its tests write one with the example's name. Each side's tests also fail when a
message type or a session body has no example.

`reader-cases.json` holds the messages both readers must reject, messages they must accept and write back in the
protocol's order, and session bodies a reader must reject, each tested by the sides that read that body.

The two serializers write the letters, digits, punctuation and symbols of every script as they are. They write
differently only characters that System.Text.Json escapes and `JSON.stringify` does not: every character outside the
Basic Multilingual Plane (emoji among them), private-use and unassigned code points, spaces other than U+0020, U+2028,
U+2029, U+FEFF and the control characters, where `JSON.stringify` escapes only the C0 controls and in lower-case hex.
Both are valid JSON for the same text, so they differ in bytes only, and the examples hold none of these characters.
