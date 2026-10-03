/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
 * (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
 * city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
 *
 */

// The bodies of /api/session, the messages on the city's WebSocket, /ws/city, and the commands a player sends the
// simulation. server/Micropolis.Rules/Protocol.cs defines the bodies and messages by hand, and the examples under
// protocol/examples/ pin the sides together: each side's tests read every example of what it reads or writes and
// write it back to the same bytes. protocol/README.md describes the wire format.

// A player as the others see them. Two players may share a name, never an id.
export interface PlayerInfo {
  id: string;
  name: string;
}

// The server's welcome, the first message on every connection: the connecting player's id, and everyone online,
// that player included, in the order they came online
export interface HelloMessage {
  type: "hello";
  you: string;
  players: PlayerInfo[];
}

// Someone came online or went offline: everyone now online, in the order they came online
export interface PlayersMessage {
  type: "players";
  players: PlayerInfo[];
}

export type ServerMessage = HelloMessage | PlayersMessage;

// Every message type, as the compiler checks against the union: a type added to ServerMessage and not here fails to
// compile, and the tests fail on a type with no example.
const SERVER_MESSAGE_TYPES: Record<ServerMessage["type"], true> = {hello: true, players: true};

export function serverMessageTypes(): string[] {
  return Object.keys(SERVER_MESSAGE_TYPES);
}

function fail(reason: string): never {
  throw new Error(`Not what the server sends: ${reason}`);
}

type JsonObject = Record<string, unknown>;

// An object with exactly the given fields: one missing or one more is an error, so a field renamed on the server
// shows up as a failure here instead of an undefined.
function objectWithFields(value: unknown, fields: string[], what: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${what} must be an object`);
  }

  const object = value as JsonObject;
  const keys = Object.keys(object);
  const missing = fields.filter((field) => !keys.includes(field));
  const unknown = keys.filter((key) => !fields.includes(key));

  if (missing.length > 0 || unknown.length > 0) {
    fail(`${what} must have the fields ${fields.join(", ")}, got ${keys.join(", ")}`);
  }

  return object;
}

function stringField(object: JsonObject, field: string, what: string): string {
  const value = object[field];

  if (typeof value !== "string") {
    fail(`${what}.${field} must be a string`);
  }

  return value;
}

// The body of POST /api/session
export interface SignInRequest {
  name: string;
}

// A new player's session, the answer to a sign-in. The name is as the server keeps it, trimmed, and the player
// learns their id from the socket's hello.
export interface SessionResponse {
  token: string;
  name: string;
}

// The player a valid token authenticates, the answer to GET /api/session
export interface PlayerResponse {
  playerId: string;
  name: string;
}

// Why the server refused a sign-in, as text to show the player
export interface ErrorResponse {
  error: string;
}

export function signInRequest(name: string): SignInRequest {
  return {name};
}

// Each reader below takes a parsed body and builds the result field by field in the protocol's order, as
// parseServerMessage does, and throws on anything else

export function parseSessionResponse(value: unknown): SessionResponse {
  const body = objectWithFields(value, ["token", "name"], "a session");
  return {token: stringField(body, "token", "a session"), name: stringField(body, "name", "a session")};
}

export function parsePlayerResponse(value: unknown): PlayerResponse {
  const body = objectWithFields(value, ["playerId", "name"], "a player response");
  return {playerId: stringField(body, "playerId", "a player response"), name: stringField(body, "name", "a player response")};
}

export function parseErrorResponse(value: unknown): ErrorResponse {
  const body = objectWithFields(value, ["error"], "an error");
  return {error: stringField(body, "error", "an error")};
}

function parsePlayers(value: unknown): PlayerInfo[] {
  if (!Array.isArray(value)) {
    fail("players must be an array");
  }

  return value.map((item) => {
    const player = objectWithFields(item, ["id", "name"], "a player");
    return {id: stringField(player, "id", "a player"), name: stringField(player, "name", "a player")};
  });
}

// Reads one message from the server. The result is built field by field in the protocol's order, so writing it
// with JSON.stringify gives the server's bytes back.
export function parseServerMessage(text: string): ServerMessage {
  const value: unknown = JSON.parse(text);

  if (typeof value !== "object" || value === null || !("type" in value)) {
    fail("a message must be an object with a type");
  }

  switch ((value as JsonObject).type) {
    case "hello": {
      const message = objectWithFields(value, ["type", "you", "players"], "hello");
      return {type: "hello", you: stringField(message, "you", "hello"), players: parsePlayers(message.players)};
    }

    case "players": {
      const message = objectWithFields(value, ["type", "players"], "players");
      return {type: "players", players: parsePlayers(message.players)};
    }

    default:
      fail(`unknown type ${JSON.stringify((value as JsonObject).type)}`);
  }
}

// The commands a player sends the simulation: every change a player makes to the city. commands.ts validates each one
// as the simulation receives it.

// The tools that change the city, as cityTools.ts builds them
export const TOOL_NAMES = [
  "airport", "bulldozer", "coal", "commercial", "fire", "industrial", "nuclear", "park", "police", "port", "rail",
  "residential", "road", "stadium", "wire",
] as const;

export type ToolName = typeof TOOL_NAMES[number];

export const DISASTER_KINDS = ["monster", "fire", "flood", "crash", "meltdown", "tornado"] as const;

export type DisasterKind = typeof DISASTER_KINDS[number];

export interface TilePosition {
  x: number;
  y: number;
}

export type Command =
  // The tool applied at each tile of the path in order, with the per-tile rules and costs of a click. A click is a
  // one-tile path; a drag's tiles are each one step along a row or column from the last. autoBulldoze is the sending
  // player's preference: whether the building, road, rail and wire tools clear what they can before building.
  | {type: "tool", tool: ToolName, path: TilePosition[], autoBulldoze: boolean}
  // The tax rate in percent, and the funding of each service named, road, fire or police, in whole percent of what it
  // needs, as the original's budget sliders set it. A service left out keeps its funding. It takes effect at once:
  // each service named works at its new funding from then on, and the next year end pays for it.
  | {type: "setBudget", road?: number, fire?: number, police?: number, tax: number}
  | {type: "setSpeed", speed: number}
  | {type: "setAutoBudget", on: boolean}
  | {type: "setDisasters", on: boolean}
  | {type: "triggerDisaster", kind: DisasterKind}
  // The debug menu's grant of funds. It is a command so that a session that used it replays; like every command, any
  // player may send it.
  | {type: "addFunds"};

export type CommandType = Command["type"];

export type ToolCommand = Extract<Command, {type: "tool"}>;

// Every command type, as the compiler checks against the union: a type added to Command and not here fails to
// compile, and the tests fail on a type with no example.
const COMMAND_TYPES: Record<CommandType, true> = {
  tool: true, setBudget: true, setSpeed: true, setAutoBudget: true, setDisasters: true, triggerDisaster: true,
  addFunds: true,
};

export function commandTypes(): string[] {
  return Object.keys(COMMAND_TYPES);
}

// The queries a player sends the simulation: questions about the city that change nothing. A query is answered at
// once, between steps or during them, and never logged as a command, since replaying it would change nothing.
// queries.ts validates each one and builds its answer.

// The maps the simulation computes, which an overlay shows one at a time over the city
export const OVERLAY_LAYERS = [
  "landValue", "pollution", "crime", "trafficDensity", "populationDensity", "policeCoverage", "fireCoverage",
  "rateOfGrowth", "powerGrid",
] as const;

export type OverlayLayer = typeof OVERLAY_LAYERS[number];

// The layer's values as the simulation last computed them
export type Query = {type: "overlay", layer: OverlayLayer};

export type QueryType = Query["type"];

// Every query type, as the compiler checks against the union: a type added to Query and not here fails to compile,
// and the tests fail on a type with no example.
const QUERY_TYPES: Record<QueryType, true> = {overlay: true};

export function queryTypes(): string[] {
  return Object.keys(QUERY_TYPES);
}

// The answer to an overlay query: the layer's values over the map in square blocks of blockSize tiles a side, width
// blocks across and height down, row by row, top row first, so block (x, y) is at index width * y + x and covers the
// tiles from (x * blockSize, y * blockSize). A block at the right or bottom edge may reach past the map. low and high
// are the ends of the layer's range, which a value may pass where the original lets it, such as the coverage of
// several stations in one block.
export interface OverlayAnswer {
  type: "overlay";
  layer: OverlayLayer;
  blockSize: number;
  width: number;
  height: number;
  low: number;
  high: number;
  values: number[];
}

// A query the simulation could not answer, and why
export interface QueryRejection {
  type: "rejected";
  reason: string;
}

export type QueryAnswer = OverlayAnswer | QueryRejection;
