# Protocol

The messages between the browser and the server, defined by hand on each side: `src/protocol.ts` for the client and
`server/Micropolis.Rules/Protocol.cs` for the server. The examples and reader cases here pin the two together.

## Transport

- `POST /api/session` with `{"name": "<display name>"}` signs a player in under a new player id. It answers
  `{"token", "playerId", "name"}`, where `token` is a JWT that lasts 30 days.
- `GET /api/session` with the token as a bearer answers `{"playerId", "name"}` while the token is valid, and 401 once
  it is not.
- `/ws/city` is one plain WebSocket carrying one JSON message per text frame. The browser cannot set an
  `Authorization` header on a WebSocket, so the token travels in the `access_token` query parameter. A connection
  without a valid token is refused, and the server closes a connection with status 1008 when its token expires.

A display name is 1 to 32 characters, counted as UTF-16 code units as JavaScript's `length` counts them, after
surrounding whitespace is trimmed, and holds no control characters. `POST /api/session` enforces it; the browser's
reader does not, since the server is the authority on what it sends.

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

Each file in `examples/` is one message: its exact wire text on one line, then a newline, in UTF-8 without a byte
order mark. The tests on both sides read every example, deserialize it into their own types and serialize it back, and
fail unless the bytes are identical, so a field renamed, added or dropped on one side turns that side red. Each side's
tests also fail when a message type has no example.

`reader-cases.json` holds the messages both readers must reject, and messages they must accept and write back in the
protocol's order.

The two serializers write the letters, digits, punctuation and symbols of every script as they are. They write
differently only characters that System.Text.Json escapes and `JSON.stringify` does not: every character outside the
Basic Multilingual Plane (emoji among them), private-use and unassigned code points, spaces other than U+0020, U+2028,
U+2029, U+FEFF and the control characters, where `JSON.stringify` escapes only the C0 controls and in lower-case hex.
Both are valid JSON for the same text, so they differ in bytes only, and the examples hold none of these characters.
