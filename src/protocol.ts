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

export type Query =
  // The layer's values as the simulation last computed them
  | {type: "overlay", layer: OverlayLayer}
  // What the query tool reports about the tile at (x, y)
  | {type: "tileReport", x: number, y: number}
  // What the year end would leave if it came now, with each service named, road, fire or police, funded at the whole
  // percent of what it needs given, as a setBudget command would fund it, and the others at the funding they have
  | {type: "budgetForecast", road?: number, fire?: number, police?: number};

export type QueryType = Query["type"];

// Every query type, as the compiler checks against the union: a type added to Query and not here fails to compile,
// and the tests fail on a type with no example.
const QUERY_TYPES: Record<QueryType, true> = {overlay: true, tileReport: true, budgetForecast: true};

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

// What the query tool calls a tile: the categories of the original's doZoneStatus, whose table queries.ts holds. The
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
// smooths the station map into the coverage, and leaves its middle step of smoothing in the station map.
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
// would do with the funding asked about: what each service would cost, the change in funds, the taxes less what the
// services would be paid, and the funds the year end would leave. Everything a budget window shows is in one answer,
// taken at one moment, though the city keeps running and other players may change the budget.
export interface BudgetForecastAnswer {
  type: "budgetForecast";
  budget: BudgetRecord;
  costs: ServiceAmounts;
  fundsChange: number;
  fundsAfterYear: number;
}

// A query the simulation could not answer, and why
export interface QueryRejection {
  type: "rejected";
  reason: string;
}

export type QueryAnswer = OverlayAnswer | TileReportAnswer | BudgetForecastAnswer | QueryRejection;

// The records the simulation produces for the windows to show: what it says about the city, as codes and numbers. The
// client turns the codes into text, so the wording is the client's alone.

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
// difficulty, 0 to 2 from easy to hard, and scoreDelta the score's change since last year. scoreBreakdown lists the
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

export type SimulationRecord = EvaluationRecord | BudgetRecord;

// Every record type, as the compiler checks against the union: a type added to SimulationRecord and not here fails to
// compile, and the tests fail on a type with no example.
const RECORD_TYPES: Record<SimulationRecord["type"], true> = {evaluation: true, budget: true};

export function recordTypes(): string[] {
  return Object.keys(RECORD_TYPES);
}
