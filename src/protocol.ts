/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

// It also defines the records the simulation produces for the windows to show.

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

// Another player in the city moved their hover box, or it went: null when no connection of theirs in the city shows
// one any longer. The server passes it on to every other player in the city, and to nothing else: the simulation
// never sees it, and no log keeps it. A player joining a city is sent the boxes showing in it.
export interface CursorMessage {
  type: "cursor";
  player: PlayerId;
  cursor: Cursor | null;
}

// The state messages the city sent in one batch, in the order it sent them: every player in the city receives the
// same batches
export interface StateBatchMessage {
  type: "state";
  messages: StateMessage[];
}

// The answer to the player's request with the given id, sent after any state the request changed. What the value is
// depends on the request: protocol/README.md lists them.
export interface AnswerMessage {
  type: "answer";
  id: number;
  value: unknown;
}

// Why the player's request with the given id failed, in words
export interface FailedMessage {
  type: "failed";
  id: number;
  error: string;
}

export type ServerMessage =
  HelloMessage | PlayersMessage | CursorMessage | StateBatchMessage | AnswerMessage | FailedMessage;

// What the server sends about the city a connection is in, which the city source reads
export type CityMessage = Exclude<ServerMessage, HelloMessage | PlayersMessage | CursorMessage>;

// The status the server closes a connection with when the city it is in fails: the server unloads the city without
// saving it, so the store keeps it as it was last saved
export const CITY_FAILED_CLOSE = 1011;

// Every message type, as the compiler checks against the union: a type added to ServerMessage and not here fails to
// compile, and the tests fail on a type with no example.
const SERVER_MESSAGE_TYPES: Record<ServerMessage["type"], true> = {
  hello: true, players: true, cursor: true, state: true, answer: true, failed: true,
};

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

// A whole number, from the least given if one is
function wholeNumberField(object: JsonObject, field: string, what: string, least?: number): number {
  const value = object[field];

  if (typeof value !== "number" || !Number.isSafeInteger(value) || (least !== undefined && value < least)) {
    fail(`${what}.${field} must be a whole number${least === undefined ? "" : ` from ${least}`}`);
  }

  return value;
}

// The kinds of a hover box's values are checked, not their ranges: the server checks those of the box it passes on
function parseCursor(value: unknown): Cursor {
  const cursor = objectWithFields(value, ["tool", "x", "y", "size"], "a hover box");
  const tool = cursor.tool;

  if (!isCursorTool(tool)) {
    fail("a hover box's tool must be one of CURSOR_TOOLS");
  }

  return {
    tool,
    x: wholeNumberField(cursor, "x", "a hover box"),
    y: wholeNumberField(cursor, "y", "a hover box"),
    size: wholeNumberField(cursor, "size", "a hover box"),
  };
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

// A request's id: a whole number from 0
function requestId(object: JsonObject, what: string): number {
  return wholeNumberField(object, "id", what, 0);
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

    case "cursor": {
      const message = objectWithFields(value, ["type", "player", "cursor"], "cursor");
      return {type: "cursor", player: stringField(message, "player", "cursor"),
              cursor: message.cursor === null ? null : parseCursor(message.cursor)};
    }

    // The batch's messages are each a state message the examples pin on both sides, so each is checked to be one of
    // the protocol's by its type, and taken as the server wrote it
    case "state": {
      const message = objectWithFields(value, ["type", "messages"], "state");
      if (!Array.isArray(message.messages)) {
        fail("state.messages must be an array");
      }

      return {type: "state", messages: message.messages.map((item: unknown) => {
        const state = item as JsonObject;
        if (typeof item !== "object" || item === null || Array.isArray(item) ||
            !stateMessageTypes().includes(state.type as string)) {
          fail("a state message must be an object of a state message type");
        }

        return item as StateMessage;
      })};
    }

    // The value is what the request asked for, which the requester reads
    case "answer": {
      const message = objectWithFields(value, ["type", "id", "value"], "answer");
      return {type: "answer", id: requestId(message, "answer"), value: message.value};
    }

    case "failed": {
      const message = objectWithFields(value, ["type", "id", "error"], "failed");
      return {type: "failed", id: requestId(message, "failed"), error: stringField(message, "error", "failed")};
    }

    default:
      fail(`unknown type ${JSON.stringify((value as JsonObject).type)}`);
  }
}

// The commands a player sends the simulation: every change a player makes to the city. The server's rules validate
// each one as the simulation receives it (CommandReader in Micropolis.Rules).

// The tools that change the city, as CityTools in the C# rules builds them
export const TOOL_NAMES = [
  "airport", "bulldozer", "coal", "commercial", "fire", "industrial", "nuclear", "park", "police", "port", "rail",
  "residential", "road", "stadium", "station", "wire",
] as const;

export type ToolName = typeof TOOL_NAMES[number];

// The tools whose work an erase command takes off: every one but the bulldozer
export type ErasedTool = Exclude<ToolName, "bulldozer">;

// The tools a hover box shows: those that change the city, the query tool and the walkway, whose box is the tile
// holding the ninth it lays
export const CURSOR_TOOLS = [...TOOL_NAMES, "query", "walkway"] as const;

export type CursorTool = typeof CURSOR_TOOLS[number];

export function isCursorTool(tool: unknown): tool is CursorTool {
  return typeof tool === "string" && (CURSOR_TOOLS as readonly string[]).includes(tool);
}

// A player's hover box on the map: the tool they hold, the map tile under their pointer, where a click applies the
// tool, and the box's side in tiles
export interface Cursor {
  tool: CursorTool;
  x: number;
  y: number;
  size: number;
}

// What a player's browser sends the server as their hover box moves over the map, or leaves it: null when it does.
// The server passes it on, from that player, as a CursorMessage.
export interface CursorReport {
  type: "cursor";
  cursor: Cursor | null;
}

export function cursorReport(cursor: Cursor | null): CursorReport {
  return {type: "cursor", cursor};
}

export const DISASTER_KINDS = ["monster", "fire", "flood", "crash", "meltdown", "tornado", "earthquake"] as const;

export type DisasterKind = typeof DISASTER_KINDS[number];

// The speeds a setSpeed command sets, as the simulation numbers them
export const SPEEDS = {paused: 0, slow: 1, medium: 2, fast: 3} as const;

export interface TilePosition {
  x: number;
  y: number;
}

// The kinds of walkway a ninth of a tile holds, as WalkwayKind in the C# rules names them, numbered from 1 in a
// tile's walkway value (WalkwayChange)
export const WALKWAY_KINDS = ["path"] as const;

export type WalkwayKind = typeof WALKWAY_KINDS[number];

// The ninths across and down each tile, on whose grid a walkway command's path runs: ninth (x, y) lies in tile
// (floor(x / 3), floor(y / 3))
export const NINTHS_PER_SIDE = 3;

// The bits a tile's walkway value gives each ninth, its kind, ninth n's from bit n times this, as Walkways.BitsPerNinth
// in the C# rules
export const BITS_PER_NINTH = 2;

// A ninth of a tile, on the map's grid of ninths
export interface NinthPosition {
  x: number;
  y: number;
}

export type Command =
  // The tool applied at each tile of the path in order, with the per-tile rules and costs of a click. A click is a
  // one-tile path; a drag's tiles are each one step along a row or column from the last. autoBulldoze is the sending
  // player's preference: whether the building, road, rail and wire tools clear what they can before building.
  | {type: "tool", tool: ToolName, path: TilePosition[], autoBulldoze: boolean}
  // Walkway of the kind laid on each ninth of the path in order, as one click each, on a tile that takes it: bare
  // land, a park, road or rail but a station. A ninth already holding the kind costs nothing. The path's ninths are
  // each one step along a row or column of the grid of ninths from the last.
  | {type: "walkway", kind: WalkwayKind, path: NinthPosition[]}
  // What the tool puts down erased at each tile of the path in order, as one click each, at the bulldozer's cost, as
  // a player holding Shift with the tool erases: a road, rail or wire takes off only that line, leaving the rest of
  // the tile; a park leaves bare land, a station its track, and a zone or building's tool blows up the one under the
  // tile, only where it is of the tool's kind. Any tool but the bulldozer.
  | {type: "erase", tool: ErasedTool, path: TilePosition[]}
  // The walkway on each ninth of the path erased in order, whatever its kind, at the bulldozer's cost each
  | {type: "eraseWalkway", path: NinthPosition[]}
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
  tool: true, walkway: true, erase: true, eraseWalkway: true, setBudget: true, setSpeed: true, setAutoBudget: true,
  setDisasters: true, triggerDisaster: true, addFunds: true,
};

export function commandTypes(): string[] {
  return Object.keys(COMMAND_TYPES);
}

// A player's id
export type PlayerId = string;

// What came of a command. A tool command is ok when the tool succeeded at every tile of its path, and otherwise takes
// the outcome of the first tile where it didn't, which its player is told of. A zone, building or park on water no
// bulldozing clears is onWater, whatever else its footprint holds.
export const OUTCOMES = ["ok", "failed", "noMoney", "needsBulldoze", "onWater", "rejected"] as const;

export type Outcome = typeof OUTCOMES[number];

// What came of a command, and who sent it. The command is whatever arrived, which a rejected one may not be.
export interface CommandResult {
  player: PlayerId;
  command: unknown;
  outcome: Outcome;
  // Why the command was rejected, or null when it wasn't
  reason: string | null;
}

// The queries a player sends the simulation: questions about the city that change nothing. A query is answered at
// once, between steps or during them, and never logged as a command, since replaying it would change nothing.
// The C# rules' Queries validates each one and builds its answer.

// The maps the simulation computes, which an overlay shows one at a time over the city. housingAppeal is each block's
// location score for homes, as the residential rule computes it from land value less pollution for a zone whose trip
// found a route, from -3000 to 3000: -3000 where the block is too polluted for a home to grow at all, and 0, which no
// location score is, on clean undeveloped land, which has no land value to score.
export const OVERLAY_LAYERS = [
  "landValue", "housingAppeal", "pollution", "crime", "trafficDensity", "populationDensity", "policeCoverage",
  "fireCoverage", "rateOfGrowth", "powerGrid", "railLoad",
] as const;

export type OverlayLayer = typeof OVERLAY_LAYERS[number];

// The largest game seed: a seed is a uint32
export const MAX_SEED = 0xffffffff;

export type Query =
  // The layer's values as the simulation last computed them
  | {type: "overlay", layer: OverlayLayer}
  // What the query tool reports about the tile at (x, y)
  | {type: "tileReport", x: number, y: number}
  // What the year end would leave if it came now, with each service named, road, fire or police, funded at the whole
  // percent of what it needs given, as a setBudget command would fund it, and the others at the funding they have;
  // and with tax, a whole percent, collecting what that rate would take from the city now, and without it what the
  // last collection took
  | {type: "budgetForecast", road?: number, fire?: number, police?: number, tax?: number}
  // The map a game seed generates, a uint32, which a new city on that seed starts on. It is answered before any city
  // has started, so the splash screen can show the maps a player chooses from.
  | {type: "mapPreview", seed: number};

export type QueryType = Query["type"];

// Every query type, as the compiler checks against the union: a type added to Query and not here fails to compile,
// and the tests fail on a type with no example.
const QUERY_TYPES: Record<QueryType, true> = {overlay: true, tileReport: true, budgetForecast: true, mapPreview: true};

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

// What the query tool calls a tile: the categories of the original's doZoneStatus, whose table Queries holds. The
// original lists industrial and the drawbridge twice, under two ranges of tiles each, and both ranges of each are
// one category here. URANIUM is the nuclear plant's swirl, which the original shows as "Ur 238".
export const ZONE_CATEGORIES = [
  "CLEAR", "WATER", "TREES", "RUBBLE", "FLOOD", "RADIOACTIVE_WASTE", "FIRE", "ROAD", "POWER", "RAIL", "RESIDENTIAL",
  "COMMERCIAL", "INDUSTRIAL", "SEAPORT", "AIRPORT", "COAL_POWER", "FIRE_STATION", "POLICE_STATION", "STADIUM",
  "NUCLEAR_POWER", "DRAWBRIDGE", "RADAR", "FOUNTAIN", "FOOTBALL_GAME", "URANIUM",
] as const;

export type ZoneCategory = typeof ZONE_CATEGORIES[number];

// The answer to a tile report query: what the simulation holds at tile (x, y), as raw values. tile is the tile's
// value without its flags, and category what the query tool calls it. The five values the query tool reports are each
// read from the block covering the tile: populationDensity, from 0 to 510; landValue and crime, from 0 to 250;
// pollution, from 0 to 255; and rateOfGrowth, from -200 to 200. The rest are what the query tool shows in debug mode,
// each read from the block covering the tile but the flags: the tile's flags, where zoneCentre is the centre of a zone;
// fireStationMap and policeStationMap, the simulation's working maps of each service, and fireCoverage and
// policeCoverage, the coverage the service's last analysis computed, each from 0 to 1000; the block's undeveloped
// terrain from 0 to 240, its traffic from 0 to 240, and its score for nearness to the city centre, from -64 to 64. A
// station map is cleared as each cycle starts, and the map scan adds the funded effect of each station it finds, halved
// for a station without power and again for one without a road beside it. When the service's analysis runs, it
// smooths the station map into the coverage, and leaves its middle step of smoothing in the station map. growth is how
// the residential, commercial or industrial zone whose footprint holds the tile grows, and null for a tile of no such
// zone.
export interface TileReportAnswer {
  type: "tileReport";
  x: number;
  y: number;
  tile: number;
  category: ZoneCategory;
  populationDensity: number;
  landValue: number;
  crime: number;
  pollution: number;
  rateOfGrowth: number;
  burnable: boolean;
  bulldozable: boolean;
  conductive: boolean;
  animated: boolean;
  powered: boolean;
  zoneCentre: boolean;
  fireStationMap: number;
  fireCoverage: number;
  policeStationMap: number;
  policeCoverage: number;
  terrainDensity: number;
  trafficDensity: number;
  cityCentreScore: number;
  growth: ZoneGrowthReport | null;
}

// Where a zone stands, by what its handler can do with it, best first: likely to grow where it can grow and never
// declines, may grow or decline where it can do both, holds steady where it can do neither, and likely to decline
// where it can decline and never grows. A zone grows at a zone score above -350 where its grow step refuses it for
// nothing, and declines at one below 350 where it has people to lose.
export const GROWTH_OUTLOOKS = ["LIKELY_TO_GROW", "MAY_GROW_OR_DECLINE", "HOLDS_STEADY", "LIKELY_TO_DECLINE"] as const;

export type GrowthOutlook = typeof GROWTH_OUTLOOKS[number];

// What holds back a zone's growth, in the order a report lists them: a condition of the zone rules that stops a zone
// growing, or a term of its zone score below zero that, at zero, would better where it stands once it has power, but
// for the result of the zone's trip, which only a trip tells. Where no term would on its own, nothing else is named,
// and the zone isn't likely to grow, the term furthest below zero is named. NO_POWER, a centre without power, sets the
// score below any that grows. LOW_DEMAND is the demand term below zero. For homes, the location term below zero is
// LOW_LAND_VALUE where the land value alone scores it below zero, and otherwise POLLUTION_OUTWEIGHS_LAND_VALUE; and
// TOO_POLLUTED is pollution above the most a home grows in, whatever the land value. For commerce: FAR_FROM_CENTRE, the
// location term, a block's score for nearness to the city centre, below zero; and LAND_VALUE_LIMITS_SIZE, a land value
// too low for a zone as crowded to grow. For an empty home zone: NO_FREE_LOT, no lot round its centre left for a
// house; and NEIGHBOURHOOD_TOO_SPARSE, a zone full of houses with too few people round it to be built up. FULL, a zone
// at the greatest population of its kind.
export const GROWTH_BLOCKERS = [
  "NO_POWER", "LOW_DEMAND", "LOW_LAND_VALUE", "POLLUTION_OUTWEIGHS_LAND_VALUE", "TOO_POLLUTED", "FAR_FROM_CENTRE",
  "LAND_VALUE_LIMITS_SIZE", "NO_FREE_LOT", "NEIGHBOURHOOD_TOO_SPARSE", "FULL",
] as const;

export type GrowthBlocker = typeof GROWTH_BLOCKERS[number];

// The categories of the zones that grow, whose tile reports say how
export const GROWTH_ZONES = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL"] as const satisfies readonly ZoneCategory[];

export type GrowthZone = typeof GROWTH_ZONES[number];

// How a zone grows, as the rules assess it at its centre, (x, y), were its trip to find a route: zone, its category;
// score, the zone score its handler would assess it by, the demand for its kind and, for homes and commerce, its
// location score, or a score below any that grows without power; outlook, where it stands; assessedNowAndThen,
// whether its handler assesses it only now and then, rather than each time the map scan finds it, as it does an empty
// home zone; wayAtEdge, whether a road or rail lies on its perimeter, or a walkway along its edge, without which the
// next trip its people make declines it, unless a walk across open land reaches a station, a walkway or its
// destination, though a zone with no people makes none; and blockers, what holds back its growth.
export interface ZoneGrowthReport {
  zone: GrowthZone;
  x: number;
  y: number;
  score: number;
  outlook: GrowthOutlook;
  assessedNowAndThen: boolean;
  wayAtEdge: boolean;
  blockers: GrowthBlocker[];
}

// An amount for each funded service
export interface ServiceAmounts {
  road: number;
  fire: number;
  police: number;
}

// The funded services, in the order the budget funds them
export const SERVICES: readonly (keyof ServiceAmounts)[] = ["road", "fire", "police"];

// The answer to a budget forecast query: the budget now, which the forecast is worked out from, and what the year end
// would do with the funding and tax rate asked about: what each service would cost, the taxes it would collect, the
// change in funds, the taxes less what the services would be paid, and the funds the year end would leave. Everything
// a budget window shows is in one answer, taken at one moment, though the city keeps running and other players may
// change the budget.
export interface BudgetForecastAnswer {
  type: "budgetForecast";
  budget: BudgetRecord;
  costs: ServiceAmounts;
  taxes: number;
  fundsChange: number;
  fundsAfterYear: number;
}

// A query the simulation could not answer, and why
export interface QueryRejection {
  type: "rejected";
  reason: string;
}

// The answer to a map preview query: the map the seed generates, width tiles across and height down, as each tile's
// raw value, with its flags, row by row, top row first, as a map message holds them
export interface MapPreviewAnswer {
  type: "mapPreview";
  seed: number;
  width: number;
  height: number;
  tiles: number[];
}

export type QueryAnswer = OverlayAnswer | TileReportAnswer | BudgetForecastAnswer | MapPreviewAnswer | QueryRejection;

// Every answer type, as the compiler checks against the union: a type added to QueryAnswer and not here fails to
// compile, and the tests fail on a type with no example.
const QUERY_ANSWER_TYPES: Record<QueryAnswer["type"], true> = {
  overlay: true, tileReport: true, budgetForecast: true, mapPreview: true, rejected: true,
};

export function queryAnswerTypes(): string[] {
  return Object.keys(QUERY_ANSWER_TYPES);
}

// The records the simulation produces for the windows to show: what it says about the city, as codes and numbers. The
// client turns the codes into text, so the wording is the client's alone.

// The game's levels of difficulty, easiest first. A level's number, which a new city starts at and the evaluation
// record gives, is its place in the list.
export const GAME_LEVELS = ["EASY", "MED", "HARD"] as const;

export type GameLevel = typeof GAME_LEVELS[number];

// The city's classes by population, smallest first
export const CITY_CLASSES = ["VILLAGE", "TOWN", "CITY", "CAPITAL", "METROPOLIS", "MEGALOPOLIS"] as const;

export type CityClass = typeof CITY_CLASSES[number];

// The problems the public votes on. A problem's id is its place in the list.
export const CITY_PROBLEMS = ["CRIME", "POLLUTION", "HOUSING", "TAXES", "TRAFFIC", "UNEMPLOYMENT", "FIRE"] as const;

// The steps of the yearly score calculation, in the order it takes them
export const SCORE_REASONS = [
  "PROBLEMS", "RES_CAP", "COM_CAP", "IND_CAP", "ROAD_FUNDING", "POLICE_FUNDING", "FIRE_FUNDING", "RES_OVERSUPPLY",
  "COM_OVERSUPPLY", "IND_OVERSUPPLY", "MIGRATION", "FIRES", "TAXES", "UNPOWERED_ZONES", "RANGE", "AVERAGING",
] as const;

export type ScoreReason = typeof SCORE_REASONS[number];

// One step of the yearly score calculation: the points it moved the score by
export interface ScoreEntry {
  reason: ScoreReason;
  points: number;
}

// The most problems an evaluation lists: the places the public ranks
export const MAX_RANKED_PROBLEMS = 4;

// The city's evaluation, as the evaluation window shows it. approval is the share of the public, in percent, who think
// the mayor is doing a good job. problems are the ids of the worst problems, worst first: at most MAX_RANKED_PROBLEMS,
// each one some of the public voted for. migration is the population's change since the last census, level the game's
// difficulty, by its number in GAME_LEVELS, and scoreDelta the score's change since last year. scoreBreakdown lists the
// steps that moved the score last year, in order. It is empty until the city's next yearly score after a new city or
// an old save migrated from before the breakdown was kept; otherwise its points sum to scoreDelta.
export interface EvaluationRecord {
  type: "evaluation";
  approval: number;
  problems: number[];
  population: number;
  migration: number;
  assessedValue: number;
  cityClass: CityClass;
  level: number;
  score: number;
  scoreDelta: number;
  scoreBreakdown: ScoreEntry[];
}

// The budget, as the budget window shows it: the tax rate in percent, the taxes the last collection brought in, the
// funds now, and for each service the maintenance it needs a year and its funding, 0 to 1 of what it needs. A funding
// the year end scaled back to the cash it had holds a fraction of a percent; a player only sets whole percents.
export interface BudgetRecord {
  type: "budget";
  taxRate: number;
  taxesCollected: number;
  funds: number;
  maintenance: ServiceAmounts;
  funding: ServiceAmounts;
}

// The city's settings, as the settings window shows them: whether auto-budget and disasters are on, and the speed the
// city runs at, one of SPEEDS, paused included
export interface SettingsRecord {
  type: "settings";
  autoBudget: boolean;
  disasters: boolean;
  speed: number;
}

export type SimulationRecord = EvaluationRecord | BudgetRecord | SettingsRecord;

// Every record type, as the compiler checks against the union: a type added to SimulationRecord and not here fails to
// compile, and the tests fail on a type with no example.
const RECORD_TYPES: Record<SimulationRecord["type"], true> = {evaluation: true, budget: true, settings: true};

export function recordTypes(): string[] {
  return Object.keys(RECORD_TYPES);
}

// The state messages a city source sends the client: everything the client shows of the city. The client keeps its
// own copy of the map, from the full map the source sends when a city starts, kept up to date by the tile changes
// after it, and renders nothing but these messages. A source sends what changed in batches: one after each turn of its
// loop that applied commands or took steps, however many steps that turn took, and one after each call of the
// end-to-end runner's driver that applies commands or takes steps. The sprites, the date, the population and the
// records go only when they differ from what it sent last, and every batch carries the step clock, just before its
// trips.

// The whole map: width tiles across and height down, each tile's raw value, with its flags, row by row, top row first
export interface MapMessage {
  type: "map";
  width: number;
  height: number;
  tiles: number[];
}

// A tile whose raw value changed, and its new value
export interface TileChange {
  x: number;
  y: number;
  value: number;
}

// The tiles that changed since the last map or tiles message
export interface TilesMessage {
  type: "tiles";
  changes: TileChange[];
}

// A tile whose walkway changed, and its walkway now: each ninth's kind in two bits, ninth n's, counted row by row
// from the tile's north-west corner, at bit 2n, as WALKWAY_KINDS numbers them from 1, and 0 for none
export interface WalkwayChange {
  x: number;
  y: number;
  ninths: number;
}

// The tiles whose walkway changed since the last walkways message. A map message starts a city without walkways, and
// the whole state lists every tile that holds any, in a walkways message after the map, if one does.
export interface WalkwaysMessage {
  type: "walkways";
  changes: WalkwayChange[];
}

// A sprite as the client draws it: its type, counted from 1 as the original's SPRITE_TRAIN and its siblings number
// them, which is its row of the sprite sheet; its frame, counted from 1, its column; and the square it is drawn in,
// width map pixels a side, with its top-left corner at map pixel (x, y)
export interface SpriteView {
  type: number;
  frame: number;
  x: number;
  y: number;
  width: number;
}

// Every sprite on the map
export interface SpritesMessage {
  type: "sprites";
  sprites: SpriteView[];
}

// The city's date: the month from 0, and the year
export interface DateMessage {
  type: "date";
  month: number;
  year: number;
}

// The city's step clock: the steps it has taken while it wasn't paused, at any speed, about 60 a second, on which the
// departure a ride is stamped with counts, so the client lines departures up with its own clock
export interface ClockMessage {
  type: "clock";
  steps: number;
}

// The city's population as the last monthly growth check counted it. The evaluation record's population is the yearly
// evaluation's.
export interface PopulationMessage {
  type: "population";
  population: number;
}

// The conditions that limit the city's growth, as the simulation publishes them each cycle: the power the plants can
// deliver and the power the grid draws, as of the last power scan; whether residential, commercial or industrial
// demand is held at zero for want of a stadium, airport or seaport; and the advisor conditions that hold, named by
// their message in messages.ts
export interface StatusRecord {
  type: "status";
  powerCapacity: number;
  powerLoad: number;
  residentialCapped: boolean;
  commercialCapped: boolean;
  industrialCapped: boolean;
  conditions: string[];
}

// The demand for each kind of zone, as the demand valves last set it: residential from -2000 to 2000, commercial and
// industrial from -1500 to 1500
export interface DemandMessage {
  type: "demand";
  residential: number;
  commercial: number;
  industrial: number;
}

// Where a piece of news happened, in map tiles
export interface NewsPlace {
  x: number;
  y: number;
}

// A place the monster TV shows
export interface ShowablePlace extends NewsPlace {
  showable: true;
}

// A place the monster TV shows, following the sprite of the given type there as it moves: a monster or a tornado, of
// which the map holds at most one each
export interface TrackablePlace extends NewsPlace {
  trackable: true;
  sprite: number;
}

// News the simulation sends for the player: its subject, one of the messages in messages.ts, and where it happened,
// if it did somewhere
export interface NewsMessage {
  type: "news";
  subject: string;
  data?: NewsPlace | ShowablePlace | TrackablePlace;
}

// What came of a command, any player's
export interface CommandResultMessage {
  type: "commandResult";
  result: CommandResult;
}

// The year end paid the budget with values the player should review: auto-budget is off, or couldn't cover the
// services. The city stepped on: nothing waits for the review.
export interface BudgetReviewDueMessage {
  type: "budgetReviewDue";
}

// The simulation recomputed the layer, so an overlay showing it is out of date
export interface OverlayUpdatedMessage {
  type: "overlayUpdated";
  layer: OverlayLayer;
}

// A trip, a run by road, of two tiles or more, of the route the traffic rule found for a zone from a tile of the zone's
// perimeter to the tile beside its destination: the tile it starts on, then a letter for each step to the next tile, N
// (up the map), E, S or W
export type Trip = [x: number, y: number, steps: string];

// A ride of such a route by rail, from the station it got on at to the one it got off at, as a trip, and the step
// clock's value of the departure from its station it boards (ClockMessage), which the train leaves at
export type Ride = [x: number, y: number, steps: string, departure: number];

// The trips the traffic rule completed that the city offered since its last batch: the runs by road, for the client to
// draw as cars, the rides, for it to draw as trains, and the walks, for it to draw as walkers, each in the order they
// were offered. A walk is a trip on the map's grid of ninths (NINTHS_PER_SIDE), through two ninths or more.
export interface TripsMessage {
  type: "trips";
  routes: Trip[];
  rides: Ride[];
  walks: Trip[];
}

export type StateMessage = MapMessage | TilesMessage | WalkwaysMessage | SpritesMessage | DateMessage | ClockMessage |
  PopulationMessage | EvaluationRecord | BudgetRecord | SettingsRecord | StatusRecord | DemandMessage | NewsMessage |
  CommandResultMessage | BudgetReviewDueMessage | OverlayUpdatedMessage | TripsMessage;

export type StateMessageType = StateMessage["type"];

// Every state message type, as the compiler checks against the union: a type added to StateMessage and not here fails
// to compile, and the tests fail on a type with no example.
const STATE_MESSAGE_TYPES: Record<StateMessageType, true> = {
  map: true, tiles: true, walkways: true, sprites: true, date: true, clock: true, population: true, evaluation: true,
  budget: true, settings: true, status: true, demand: true, news: true, commandResult: true, budgetReviewDue: true,
  overlayUpdated: true, trips: true,
};

export function stateMessageTypes(): string[] {
  return Object.keys(STATE_MESSAGE_TYPES);
}

// The messages a player's browser sends the server on the city's WebSocket, which protocol/README.md specifies: each a
// request carrying an id, which the server's answer to it, or its failure, carries back, but a command and a hover box
export type ClientMessage =
  | CursorReport
  | {type: "start", id: number, name: string, seed: number, level: number}
  | {type: "upload", id: number, save: string}
  | {type: "join", id: number, city: string}
  | {type: "command", command: Command}
  | {type: "query", id: number, query: Query}
  | {type: "save", id: number}
  | {type: "download", id: number}
  | {type: "commandLog", id: number}
  // The debug channel, which only a Debug build of the server answers
  | {type: "hold", id: number}
  | {type: "release", id: number}
  | {type: "flush", id: number}
  | {type: "advance", id: number, steps: number}
  | {type: "cityTime", id: number}
  | {type: "savedGame", id: number}
  | {type: "stateHash", id: number}
  | {type: "fireStationReach", id: number, station: TilePosition, target: TilePosition}
  | {type: "turn", id: number, milliseconds: number};

export type ClientMessageType = ClientMessage["type"];

// The messages the server answers
export type ClientRequest = Exclude<ClientMessage, {type: "command"} | CursorReport>;

// The answer to each request, by its type. A request type missing here fails to compile where its answer is read.
export interface RequestAnswers {
  start: CityJoined;
  upload: CityJoined;
  join: CityJoined;
  query: QueryAnswer;
  // Once the server's store has kept the city
  save: null;
  // The saved game's text, as the game saves one, for the player to keep as a file
  download: string;
  commandLog: SessionLog;
  hold: null;
  release: null;
  flush: null;
  advance: AdvanceResult;
  // In the units the city's date counts: 48 a year
  cityTime: number;
  // The saved game's text, as the game saves one
  savedGame: string;
  // The city's state hash, as the C# rules compute it (docs/state-hash.md)
  stateHash: string;
  fireStationReach: FireStationReach;
  turn: null;
}

// The answer to the request
export type RequestAnswer<Request extends ClientRequest> = RequestAnswers[Request["type"]];

// Every message type a player sends, as the compiler checks against the union: a type added to ClientMessage and not
// here fails to compile, and the tests fail on a type with no example.
const CLIENT_MESSAGE_TYPES: Record<ClientMessageType, true> = {
  cursor: true, start: true, upload: true, join: true, command: true, query: true, save: true, download: true,
  commandLog: true, hold: true, release: true, flush: true, advance: true, cityTime: true, savedGame: true,
  stateHash: true, fireStationReach: true, turn: true,
};

export function clientMessageTypes(): string[] {
  return Object.keys(CLIENT_MESSAGE_TYPES);
}

// The id a city on the server has, as the server writes one: 32 lower-case hexadecimal digits
export const CITY_ID = /^[0-9a-f]{32}$/;

// The answer to a start, an upload or a join: the city's id, by which any player joins it, its name, and its game seed
export interface CityJoined {
  city: string;
  name: string;
  seed: number;
}

// A session's command log, as a city source records it and the answer to a commandLog request carries it: the log,
// which the headless runner replays (docs/command-log.md), and the steps the city has taken since the session began
export interface SessionLog {
  log: object;
  step: number;
}

// What came of an advance, as the answer to an advance request carries it: the steps it took, whether a year-end
// budget review fell due during them, and why it failed, or null when it took every step asked for
export interface AdvanceResult {
  steps: number;
  budgetReviewDue: boolean;
  error: string | null;
}

// What a fire station centred at a tile would give a target tile, as the answer to a fireStationReach request carries
// it, worked out by the rules without changing the city: the tiles of its perimeter on the map, in the order the scan
// searches them for its road, each with the cover at the target of the station, powered, at the city's fire funding,
// as the only one on the map, with its road on that tile
export interface FireStationReach {
  perimeter: RoadReach[];
}

// A tile of a fire station's perimeter, and the cover the station would give the target with its road there
export interface RoadReach {
  x: number;
  y: number;
  cover: number;
}
