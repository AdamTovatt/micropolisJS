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

// Writes the conformance files the TypeScript reference computes: `npm run conformance`. conformance/README.md
// describes each file.

import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import {
  cityFromSave, cityOnMap, Level, LevelName, RUNNING_SPEEDS, RunningSpeed, SaveData, Speed,
} from "../headless/city";
import { RUN_STEPS } from "../headless/fixtures/fixture";
import { fixtureNames } from "../headless/fixtures/index";
import { builtSave, fixtureLog, replay, startFromSave } from "../headless/runner";
import { BlockMap } from "../src/blockMap";
import { canonicalJson } from "../src/canonicalJson";
import { Checkpoint, CommandLog, parseLog } from "../src/commandLog";
import { StampedCommand } from "../src/commandQueue";
import { Commercial } from "../src/commercial.js";
import { GameMap } from "../src/gameMap.js";
import { Industrial } from "../src/industrial.js";
import { MapGenerator } from "../src/mapGenerator.js";
import * as Messages from "../src/messages";
import { Position } from "../src/position";
import { CITY_CLASSES, DISASTER_KINDS, LOCAL_PLAYER, OUTCOMES, SCORE_REASONS, TOOL_NAMES } from "../src/protocol";
import { Random } from "../src/random";
import { Residential } from "../src/residential.js";
import { SaveFormat } from "../src/savedGame";
import { SPRITE_EXPLOSION, SPRITE_MONSTER, SPRITE_SHIP } from "../src/spriteConstants";
import { hashSavedState, plainSavedState, savedState, stateHash } from "../src/stateHash";
import { Tile } from "../src/tile";
import * as TileFlags from "../src/tileFlags";
import { TileUtils } from "../src/tileUtils.js";
import * as TileValues from "../src/tileValues";
import { Traffic } from "../src/traffic.js";
import { ZoneUtils } from "../src/zoneUtils.js";
import { CityRun, describeStart, RANDOM_DISASTER_NAMES, recordRun, RunStart } from "./cityRuns";
import { COMMAND_CASES } from "./commandCases";
import { Internals } from "./instrumentation";
import { COMMAND_POINTS, SNAPSHOT_POINTS } from "./snapshotPoints";
import { TRACES } from "./tracePoints";
import { recordTraces } from "./traces";
import {
  COMMAND_UNIT, recordCommandSnapshots, recordSnapshots, recordSpeed, SnapshotRecord, UNIT_NAMES,
} from "./unitSnapshots";

// Relative to the repository root, where npm runs scripts
const CONFORMANCE_DIRECTORY = "conformance";

// The text exactly as given
function writeText(name: string, text: string): void {
  const file = path.join(CONFORMANCE_DIRECTORY, name);
  fs.writeFileSync(file, text);
  console.log(`wrote ${file}`);
}

function writeFile(name: string, lines: string[]): void {
  writeText(name, lines.join("\n") + "\n");
}

// One JSON value per line, in a list
function listLines(key: string, values: unknown[], last: boolean): string[] {
  if (values.length === 0) {
    return [`  ${JSON.stringify(key)}: []${last ? "" : ","}`];
  }

  return [
    `  ${JSON.stringify(key)}: [`,
    ...values.map((value, i) => `    ${JSON.stringify(value)}${i < values.length - 1 ? "," : ""}`),
    `  ]${last ? "" : ","}`,
  ];
}

function ensureCovers(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`The conformance data would not cover ${message}`);
  }
}

// --- tiles.json: every name in tileValues.ts and tileFlags.ts, which the C# constants are checked against

// One name per line, sorted, as a module namespace lists its exports
function namedLines(key: string, module: Record<string, unknown>, last: boolean): string[] {
  const entries = Object.entries(module);

  return [
    `  ${JSON.stringify(key)}: {`,
    ...entries.map(([name, value], i) => `    ${JSON.stringify(name)}: ${JSON.stringify(value)}${i < entries.length - 1 ? "," : ""}`),
    `  }${last ? "" : ","}`,
  ];
}

function tileLines(): string[] {
  return ["{", ...namedLines("values", TileValues, false), ...namedLines("flags", TileFlags, true), "}"];
}

// --- canonicalJson.json: the canonical text of numbers, strings and documents

// A double's IEEE 754 bits, as sixteen lowercase hex digits
function bitsOf(value: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return "0x" + view.getBigUint64(0).toString(16).padStart(16, "0");
}

function doubleOf(high: number, low: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setUint32(0, high);
  view.setUint32(4, low);
  return view.getFloat64(0);
}

// The layout docs/state-hash.md gives the canonical text of a number, read back from the text
function numberLayout(text: string): string {
  const magnitude = text.replace(/^-/, "");

  if (magnitude.includes("e")) {
    return magnitude.includes(".") ? "exponent with fraction" : "exponent";
  } else if (magnitude.startsWith("0.")) {
    return "below one";
  } else if (magnitude.includes(".")) {
    return "with fraction";
  } else {
    return "integer";
  }
}

function numberVectors(): {bits: string, text: string}[] {
  const values = [
    0, -0, 1, -1, 7, 1200, 123456789012, 2 ** 53, 2 ** 53 + 2, -(2 ** 31), 2 ** 32 - 1,
    16.8, -0.5, 0.1 * 3, 1 / 3, 4.35, 123.456, 1e20, 123456789012345680000, 1e21, 1.5e21, -1e21,
    0.007, 0.1, 0.000001, 0.0000015, 1e-7, 1.5e-7, -1.5e-7, 9.999999999999997e-7,
    Number.MAX_VALUE, Number.MIN_VALUE, -Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, Number.EPSILON, 2.2250738585072014e-308,
    1e100, 1.7976931348623157e+308, 5e-324, 9.999999999999999e22, 1e23, 0.1 + 0.2,
    // Integers past 2^53 whose shortest digits end in zeros where a long's digits don't
    2 ** 62, 1e18 + 128,
  ];

  // Each funding share the budget sets, as the single-precision value the save writes
  for (let percent = 0; percent <= 100; percent++) {
    values.push(Math.fround(percent / 100));
  }

  // Short digit strings at every exponent around the layout boundaries
  const random = Random.fromSeed(0x2a);
  for (let exponent = -30; exponent <= 30; exponent++) {
    values.push(Number(`${random.getRandom(9999)}e${exponent}`));
    values.push(Number(`${random.getRandom(9)}.${random.getRandom(99)}e${exponent}`));
  }

  // Doubles drawn uniformly from their bit patterns, so most need all seventeen digits
  while (values.length < 600) {
    const value = doubleOf(random.next(), random.next());

    if (Number.isFinite(value)) {
      values.push(value);
    }
  }

  const vectors = values.map((value) => ({bits: bitsOf(value), text: canonicalJson(value)}));

  for (const layout of ["integer", "with fraction", "below one", "exponent", "exponent with fraction"]) {
    ensureCovers(vectors.some((vector) => numberLayout(vector.text) === layout), `the number layout "${layout}"`);
  }

  ensureCovers(vectors.some((vector) => vector.bits === bitsOf(-0)), "negative zero");

  return vectors;
}

function stringVectors(): {codeUnits: number[], text: string}[] {
  const strings: number[][] = [];

  // Every code unit below U+0080 alone: each control character, quote, backslash and printable ASCII
  for (let unit = 0; unit < 0x80; unit++) {
    strings.push([unit]);
  }

  // Characters written as themselves, among them the line and paragraph separators JSON.stringify leaves alone
  for (const unit of [0x80, 0x9f, 0xa0, 0xe9, 0x2028, 0x2029, 0xfeff, 0xfffe, 0xffff]) {
    strings.push([unit]);
  }

  // Surrogates: lone ones are escaped, and a pair in order is a character written as itself
  strings.push([0xd800], [0xdbff], [0xdc00], [0xdfff]);
  strings.push([0xd83d, 0xde00], [0xde00, 0xd83d], [0xd800, 0xd800], [0x61, 0xd800], [0xdc00, 0x61]);
  strings.push([0xd83d, 0xde00, 0xd83d], [0xdbff, 0xdfff]);

  // Empty, and characters of several classes together
  strings.push([]);
  strings.push(Array.from("Now a town \"quoted\"\\\n\t\u0000é→", (character) => character.charCodeAt(0)));

  return strings.map((codeUnits) => ({codeUnits, text: canonicalJson(String.fromCharCode(...codeUnits))}));
}

function documentVectors(): {json: string, text: string}[] {
  const documents = [
    "{}",
    "[]",
    "null",
    "[true, false, null]",
    '{ "b": 1, "a": [1, 2, { "d": null, "c": true }], "B": false, "_z": "x" }',
    '{"\\u00e9": 1, "z": 2, "\\ud83d\\ude00": 3, "\\uffff": 4, " ": 5, "": 6, "Z": 7, "a\\u0000": 8, "a": 9}',
    '{"outer": {"inner": {"deepest": [[], {}, [{}]]}}}',
    "[1.0, 1e2, -0, 0.1, 1E21, 5e-324, 100000000000000000000, 1.5e-7, -1.25E+3]",
    '{"text": "a\\"b\\\\c\\b\\f\\n\\r\\t\\u0001\\u001f\\u2028\\/"}',
  ];

  return documents.map((json) => ({json, text: canonicalJson(JSON.parse(json))}));
}

function canonicalJsonLines(): string[] {
  return [
    "{",
    ...listLines("numbers", numberVectors(), false),
    ...listLines("strings", stringVectors(), false),
    ...listLines("documents", documentVectors(), true),
    "}",
  ];
}

// --- maps.json: the hash of the map object each seed generates, and every tile of a few

interface MapObject {
  width: number;
  height: number;
  tiles: number[];
}

interface GeneratedMap {
  seed: number;
  kind: string;
  lakes: number;
  map: MapObject;
}

// The map the seed generates, as GameMap.save writes it, and which way the generator went: the draws it made say
// which kind of land it laid, and how many lakes
function generate(seed: number): GeneratedMap {
  const stream = Random.mapStream(seed);
  const draws: [number, number][] = [];

  const recorder = {
    getRandom(max: number): number {
      const value = stream.getRandom(max);
      draws.push([max, value]);
      return value;
    },

    getERandom(max: number): number {
      return stream.getERandom(max);
    },
  };

  const saveData: {map?: MapObject} = {};
  MapGenerator(recorder).save(saveData);

  // The first draw decides between an island, a naked island with rivers, and plain land; an island needs a second
  const createIsland = draws[0][1] - 1;
  const island = createIsland < 0 && draws[1][1] < 10;
  const kind = island ? "island" : createIsland === 1 ? "nakedIsland" : createIsland === 0 ? "land" : "landAfterIslandDraw";
  const lakeDraw = draws.find(([max]) => max === 10);

  return {seed, kind, lakes: lakeDraw ? lakeDraw[1] : 0, map: saveData.map!};
}

// The maps the seeds cover: how many of each sort, and how to tell one
const WANTED: {name: string, count: number, matches(map: GeneratedMap): boolean}[] = [
  {name: "an island", count: 3, matches: (map) => map.kind === "island"},
  {name: "a naked island with rivers", count: 3, matches: (map) => map.kind === "nakedIsland"},
  {name: "land", count: 3, matches: (map) => map.kind === "land"},
  {name: "land after the island draw", count: 3, matches: (map) => map.kind === "landAfterIslandDraw"},
  {name: "rivers and no lakes", count: 1, matches: (map) => map.kind !== "island" && map.lakes === 0},
  {name: "the most lakes", count: 1, matches: (map) => map.lakes === 10},
];

const SEARCHED_SEEDS = 10000;

// Every tile of these maps is listed, so a mismatch can be located: the first seed of each kind the generator lays
// out differently
const LISTED_KINDS = ["island", "nakedIsland", "land"];

// Counting from zero, each seed whose map some sort still wants, and the largest seed
function chooseMaps(): GeneratedMap[] {
  const chosen: GeneratedMap[] = [];
  const wanting = () => WANTED.filter((want) => chosen.filter(want.matches).length < want.count);

  for (let seed = 0; seed < SEARCHED_SEEDS && wanting().length > 0; seed++) {
    const generated = generate(seed);

    if (wanting().some((want) => want.matches(generated))) {
      chosen.push(generated);
    }
  }

  for (const want of wanting()) {
    ensureCovers(false, `${want.name} in the first ${SEARCHED_SEEDS} seeds`);
  }

  chosen.push(generate(0xffffffff));
  return chosen;
}

// A map object with its tiles one row per line
function listedMapLines(generated: GeneratedMap, last: boolean): string[] {
  const {tiles, ...rest} = generated.map;
  const fields = Object.entries(rest).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)},`).join("");
  const rows: string[] = [];

  for (let y = 0; y < generated.map.height; y++) {
    const row = tiles.slice(y * generated.map.width, (y + 1) * generated.map.width);
    rows.push(`        ${row.join(",")}${y < generated.map.height - 1 ? "," : ""}`);
  }

  return [
    `    {"seed":${generated.seed},"map":{${fields}"tiles":[`,
    ...rows,
    `    ]}}${last ? "" : ","}`,
  ];
}

async function mapLines(chosen: GeneratedMap[]): Promise<string[]> {
  const seeds = await Promise.all(chosen.map(async ({seed, kind, lakes, map}) =>
    ({seed, kind, lakes, hash: await hashSavedState(map)})));
  const listed = LISTED_KINDS.map((kind) => chosen.find((map) => map.kind === kind)!);

  return [
    "{",
    ...listLines("seeds", seeds, false),
    '  "maps": [',
    ...listed.flatMap((generated, i) => listedMapLines(generated, i === listed.length - 1)),
    "  ]",
    "}",
  ];
}

// --- saveStrings.json: the strings a save may hold, which the C# save model's names are checked against

// The announcements of a new city class that checkGrowth in simulation.js sends, smallest class first
const CITY_CLASS_MESSAGES = [Messages.REACHED_TOWN, Messages.REACHED_CITY, Messages.REACHED_CAPITAL,
                             Messages.REACHED_METROPOLIS, Messages.REACHED_MEGALOPOLIS];

function saveStringLines(): string[] {
  return [
    "{",
    ...listLines("cityClasses", [...CITY_CLASSES], false),
    ...listLines("scoreReasons", [...SCORE_REASONS], false),
    ...listLines("cityClassMessages", CITY_CLASS_MESSAGES, true),
    "}",
  ];
}

// --- saves/: each fixture's saved state as built and after its golden run, and the steps they are taken at

const SAVES_DIRECTORY = "saves";

// The checkpoints each fixture's saves are taken at: its first, as built, and its last, after its run
const SAVE_POINTS = {built: (steps: number[]) => steps[0], run: (steps: number[]) => steps[steps.length - 1]};

async function writeSaves(): Promise<void> {
  fs.mkdirSync(path.join(CONFORMANCE_DIRECTORY, SAVES_DIRECTORY));

  const checkpoints: Record<string, Record<string, number>> = {};

  for (const name of fixtureNames()) {
    const log = fixtureLog(name);
    const steps = log.checkpoints.map((checkpoint) => checkpoint.step);
    checkpoints[name] = {};

    for (const [point, stepOf] of Object.entries(SAVE_POINTS)) {
      const step = stepOf(steps);

      // Fails unless the state matches each of the fixture's golden hashes up to the step, its own included
      const replayed = replay(log, {to: step});
      await replayed.verified;

      // The canonical text alone, so the file's SHA-256 is the state hash
      writeText(path.join(SAVES_DIRECTORY, `${name}.${point}.json`), canonicalJson(savedState(replayed.city)));
      checkpoints[name][point] = step;
    }
  }

  ensureCovers(Object.keys(checkpoints).length > 0, "a fixture's save");

  writeFile(path.join(SAVES_DIRECTORY, "checkpoints.json"), [
    "{",
    ...Object.entries(checkpoints).map(([name, points], i, all) =>
      `  ${JSON.stringify(name)}: ${JSON.stringify(points)}${i < all.length - 1 ? "," : ""}`),
    "}",
  ]);
}

// --- helpers.json: what the helpers the tile handlers share answer, over the saves written above

// The tile predicates of tileUtils.js that read a tile's value
const VALUE_PREDICATES = ["canBulldoze", "isCommercial", "isDriveable", "isFire", "isFlood", "isIndustrial",
                          "isManualExplosion", "isRail", "isResidential", "isRoad"];

// Those that read a zone's centre, given a tile with the zone flag
const ZONE_PREDICATES = ["isCommercialZone", "isIndustrialZone", "isResidentialZone"];

// A city's internals the helpers are given
interface HelperCity {
  _map: InstanceType<typeof GameMap>;
  blockMaps: {rateOfGrowthMap: BlockMap};
  _repairManager: {checkTile(x: number, y: number, cityTime: number): void, _actions: {criterion: unknown}[]};
  spriteManager: {spriteList: unknown[], getSprite(type: number): unknown, getBoatDistance(x: number, y: number): number};
}

// A save the generator wrote to saves/, so each vector names the save the C# reads it from
function writtenSave(fixture: string, point: string): SaveData {
  return JSON.parse(fs.readFileSync(path.join(CONFORMANCE_DIRECTORY, SAVES_DIRECTORY, `${fixture}.${point}.json`), "utf8"));
}

function helperCity(save: SaveData): HelperCity {
  return cityFromSave(save) as unknown as HelperCity;
}

// One character per tile value, 1 where the predicate holds
function truthLine(predicate: (value: number) => unknown): string {
  return Array.from({length: TileValues.TILE_COUNT}, (_, value) => (predicate(value) === true ? "1" : "0")).join("");
}

// Each zone centre of the fixtures' saves: its population as its own kind of zone counts it, the road on
// its perimeter traffic starts from, and its land value less its pollution as a category
function zoneVectors(): object[] {
  type Population = {getZonePopulation(map: unknown, x: number, y: number, tileValue: number): number};
  const populations: [string, (tile: Tile) => boolean, Population][] = [
    ["residential", (tile) => TileUtils.isResidentialZone(tile), Residential],
    ["commercial", (tile) => TileUtils.isCommercialZone(tile), Commercial],
    ["industrial", (tile) => TileUtils.isIndustrialZone(tile), Industrial],
  ];

  return fixtureNames().flatMap((fixture) => Object.keys(SAVE_POINTS).flatMap((point) => {
    const city = helperCity(writtenSave(fixture, point));
    const map = city._map;
    const traffic = new Traffic(map, null, null);
    const zones: object[] = [];

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.getTile(x, y);
        if (!tile.isZone()) {
          continue;
        }

        const kind = populations.find(([, isKind]) => isKind(tile));
        const road = traffic.findPerimeterRoad(new Position(x, y));
        zones.push({
          fixture, point, x, y, value: tile.getValue(), kind: kind ? kind[0] : null,
          population: kind ? kind[2].getZonePopulation(map, x, y, tile.getValue()) : null,
          perimeterRoad: road === null ? null : {x: road.x, y: road.y},
          landPollutionValue: ZoneUtils.getLandPollutionValue(city.blockMaps, x, y),
        });
      }
    }

    return zones;
  }));
}

// The fixture whose zones are repaired, and the city times each repair is tried at, which its period's bits pass or not
const REPAIR_FIXTURE = "suburbBroke";
const REPAIR_TIMES = [0, 1, 4, 8, 16];

// What the repair manager restores of a zone it repairs: a tile cleared to dirt and one built over with road are put
// back, and rubble is left
const REPAIR_DAMAGE = [{dx: 1, dy: -1, value: TileValues.DIRT}, {dx: -1, dy: 1, value: TileValues.RUBBLE},
                       {dx: 1, dy: 1, value: TileValues.ROADBASE + 1}];

// The n by n tiles from (left, top), as raw values row by row
function areaFrom(map: InstanceType<typeof GameMap>, left: number, top: number, n: number): number[] {
  return Array.from({length: n * n}, (_, i) => map.getTile(left + (i % n), top + Math.floor(i / n)).getRawValue());
}

// The six by six tiles from the centre's upper left neighbour, which hold the largest zone
function zoneArea(map: InstanceType<typeof GameMap>, x: number, y: number): number[] {
  return areaFrom(map, x - 1, y - 1, 6);
}

function repairVectors(): object[] {
  const save = writtenSave(REPAIR_FIXTURE, "built");
  const map = helperCity(save)._map;
  const repairs: object[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!map.getTile(x, y).isZone()) {
        continue;
      }

      for (const cityTime of REPAIR_TIMES) {
        const city = helperCity(save);
        for (const {dx, dy, value} of REPAIR_DAMAGE) {
          city._map.setTile(x + dx, y + dy, value, 0);
        }

        const damaged = zoneArea(city._map, x, y);
        city._repairManager.checkTile(x, y, cityTime);
        const area = zoneArea(city._map, x, y);
        repairs.push({x, y, cityTime, repaired: area.some((raw, i) => raw !== damaged[i]), area});
      }
    }
  }

  ensureCovers(repairs.some((repair) => (repair as {repaired: boolean}).repaired), "a zone repaired");
  ensureCovers(repairs.some((repair) => !(repair as {repaired: boolean}).repaired), "a zone left for another time");

  return repairs;
}

// The fixtures whose zones are set on fire as built, which hold zones of 3×3 and 4×4 tiles and the airport
const FIRE_FIXTURES = ["suburbBroke", "town"];

// Each zone centre set on fire: its block's rate of growth after, and the seven by seven tiles from its upper left
// neighbour, which hold the furthest the sweep reaches; then a zone laid where the sweep runs off the map
function fireZoneVectors(): object[] {
  type FireVector = {fixture: string, x: number, y: number, value: number, laid: number | null, rateOfGrowth: number,
                     areaSize: number, area: number[]};
  const fires: FireVector[] = FIRE_FIXTURES.flatMap((fixture) => {
    const save = writtenSave(fixture, "built");
    const map = helperCity(save)._map;
    const centres: {fixture: string, x: number, y: number, value: number}[] = [];

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.getTile(x, y).isZone()) {
          centres.push({fixture, x, y, value: map.getTileValue(x, y)});
        }
      }
    }

    return centres.map((centre) => {
      const city = helperCity(save);
      ZoneUtils.fireZone(city._map, centre.x, centre.y, city.blockMaps);
      return {...centre, laid: null, rateOfGrowth: city.blockMaps.rateOfGrowthMap.worldGet(centre.x, centre.y),
              areaSize: 7, area: areaFrom(city._map, centre.x - 1, centre.y - 1, 7)};
    });
  });

  // A power plant laid in the map's lower right corner, whose sweep, a row and a column past the plant, is off the map
  const fixture = FIRE_FIXTURES[0];
  const city = helperCity(writtenSave(fixture, "built"));
  const corner = {x: city._map.width - 3, y: city._map.height - 3};
  city._map.putZone(corner.x, corner.y, TileValues.POWERPLANT, 4);
  ZoneUtils.fireZone(city._map, corner.x, corner.y, city.blockMaps);
  fires.push({fixture, ...corner, value: TileValues.POWERPLANT, laid: 4,
              rateOfGrowth: city.blockMaps.rateOfGrowthMap.worldGet(corner.x, corner.y),
              areaSize: 4, area: areaFrom(city._map, corner.x - 1, corner.y - 1, 4)});

  ensureCovers(fires.some((fire) => fire.value === TileValues.AIRPORT), "the airport on fire");
  ensureCovers(fires.some((fire) => ZoneUtils.checkZoneSize(fire.value) === 4), "a 4×4 zone on fire");
  ensureCovers(fires.some((fire) => ZoneUtils.checkZoneSize(fire.value) === 3), "a 3×3 zone on fire");

  return fires;
}

// The rate of growth a block starts at and the change, from either end of its range to the middle
const GROWTH_STARTS = [-200, -199, -5, 0, 5, 199, 200];
const GROWTH_DELTAS = [-3, -1, 0, 1, 3];

function growthVectors(): object[] {
  const blockMaps = helperCity(writtenSave(REPAIR_FIXTURE, "built")).blockMaps;

  return GROWTH_STARTS.flatMap((start) => GROWTH_DELTAS.map((delta) => {
    blockMaps.rateOfGrowthMap.worldSet(0, 0, start);
    ZoneUtils.incRateOfGrowth(blockMaps, 0, 0, delta);
    return {start, delta, result: blockMaps.rateOfGrowthMap.worldGet(0, 0)};
  }));
}

// The zone centres laid, each powered or not, and the values a tile of the area holds before, which flood, radiation
// and fire among them stop it being laid: each at the corner below and right of the centre, and flood at each corner
const PUT_CENTRES = [TileValues.FREEZ, TileValues.COMCLR, TileValues.INDCLR];
const PUT_BLOCKERS = [TileValues.RUBBLE + 3, TileValues.FLOOD, TileValues.LASTFLOOD, TileValues.RADTILE,
                      TileValues.FIRE + 3, TileValues.ROADBASE - 1, TileValues.ROADBASE];
const PUT_CORNERS = [{dx: -1, dy: -1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}];

// Zones laid on the repair fixture's map, centred on the first 3×3 area with no tile from flood up, which putZone
// checks: the five by five tiles around the centre after, as raw values row by row
function putZoneVectors(): object[] {
  const fixture = REPAIR_FIXTURE;
  const save = writtenSave(fixture, "built");
  const map = helperCity(save)._map;
  let x = 2;
  let y = 2;
  while (areaFrom(map, x - 1, y - 1, 3).some((raw) => (raw & TileFlags.BIT_MASK) >= TileValues.FLOOD)) {
    x = x + 1 < map.width - 2 ? x + 1 : 2;
    y = x === 2 ? y + 1 : y;
  }

  type Blocker = {dx: number, dy: number, value: number} | null;
  const cases: {centreTile: number, isPowered: boolean, blocker: Blocker}[] = [
    ...PUT_CENTRES.flatMap((centreTile) => [true, false].map((isPowered) => ({centreTile, isPowered, blocker: null}))),
    ...PUT_BLOCKERS.map((value) => ({centreTile: TileValues.FREEZ, isPowered: true, blocker: {dx: 1, dy: 1, value}})),
    ...PUT_CORNERS.map(({dx, dy}) => ({centreTile: TileValues.FREEZ, isPowered: true,
                                       blocker: {dx, dy, value: TileValues.FLOOD}})),
  ];

  const puts = cases.map(({centreTile, isPowered, blocker}) => {
    const city = helperCity(save);
    if (blocker !== null) {
      city._map.setTile(x + blocker.dx, y + blocker.dy, blocker.value, 0);
    }

    ZoneUtils.putZone(city._map, x, y, centreTile, isPowered);
    return {fixture, x, y, centreTile, isPowered, blocker, laid: city._map.getTile(x, y).isZone(),
            area: areaFrom(city._map, x - 2, y - 2, 5)};
  });

  ensureCovers(puts.some((put) => put.laid) && puts.some((put) => !put.laid), "a zone laid and a zone stopped");

  return puts;
}

// The city whose sprites are read, with a ship at sea added, and a monster that has died, which getSprite finds none
// of while no pass has taken it out of the list. A list holds at most one sprite of each type but explosions, so these
// are types the city's list holds none of.
const SPRITE_FIXTURE = "town";
const SPRITE_TILES = [[0, 0], [1, 1], [37, 31], [56, 12], [119, 99]];

function spriteVector(): object {
  const save = writtenSave(SPRITE_FIXTURE, "run");
  const list = (save as unknown as {sprites: {list: {type: number}[]}}).sprites.list;
  const template = list[0];
  const added = [{...template, type: SPRITE_SHIP, frame: 3, x: 600, y: 500},
                 {...template, type: SPRITE_MONSTER, frame: 0, x: 900, y: 210}];
  if (list.some((sprite) => added.some((each) => each.type === sprite.type))) {
    throw new Error(`${SPRITE_FIXTURE}'s list already holds a ship or a monster, which a list holds one of at most`);
  }
  list.push(...added);

  const sprites = helperCity(save).spriteManager;
  const types = Array.from({length: SPRITE_EXPLOSION}, (_, i) => i + 1);
  const firstOfType = types.map((type) => {
    const index = sprites.spriteList.indexOf(sprites.getSprite(type));
    return {type, index: index === -1 ? null : index};
  });

  ensureCovers(firstOfType.some(({index}) => index !== null), "a type with a live sprite");
  // The monster added is the list's one monster, and dead
  ensureCovers(firstOfType.some(({type, index}) => type === SPRITE_MONSTER && index === null),
               "a type whose sprite has died");

  return {
    fixture: SPRITE_FIXTURE, point: "run", added, firstOfType,
    boatDistances: SPRITE_TILES.map(([x, y]) => ({x, y, distance: sprites.getBoatDistance(x, y)})),
  };
}

function helperLines(): string[] {
  const tiles = TileUtils as unknown as Record<string, (tile: unknown) => unknown>;
  const values = VALUE_PREDICATES.map((name) => [name, truthLine((value) => tiles[name](value))]);
  const zoneCentres = ZONE_PREDICATES.map((name) => [name, truthLine((value) => tiles[name](new Tile(value, TileFlags.ZONEBIT)))]);
  const zones = zoneVectors() as {kind: string | null, value: number, perimeterRoad: unknown, landPollutionValue: number}[];
  const tileValues = Array.from({length: TileValues.TILE_COUNT}, (_, value) => value);

  ensureCovers(zones.some((zone) => zone.value === TileValues.FREEZ), "an empty residential zone");
  ensureCovers(zones.some((zone) => zone.kind === "commercial") && zones.some((zone) => zone.kind === "industrial"),
               "a commercial and an industrial zone");
  ensureCovers(zones.some((zone) => zone.perimeterRoad === null), "a zone with no road on its perimeter");
  for (const category of [0, 1, 2, 3]) {
    ensureCovers(zones.some((zone) => zone.landPollutionValue === category), `a zone of land pollution value ${category}`);
  }

  const lines = (key: string, entries: string[][]) => [
    `  ${JSON.stringify(key)}: {`,
    ...entries.map(([name, line], i) => `    ${JSON.stringify(name)}: ${JSON.stringify(line)}${i < entries.length - 1 ? "," : ""}`),
    "  },",
  ];

  return [
    "{",
    ...lines("valuePredicates", values),
    ...lines("zonePredicates", zoneCentres),
    `  "checkZoneSize": ${JSON.stringify(tileValues.map((value) => ZoneUtils.checkZoneSize(value)))},`,
    `  "checkBigZone": ${JSON.stringify(tileValues.map((value) => {
      const {zoneSize, deltaX, deltaY} = ZoneUtils.checkBigZone(value);
      return [zoneSize, deltaX, deltaY];
    }))},`,
    ...listLines("zones", zones, false),
    ...listLines("fireZones", fireZoneVectors(), false),
    ...listLines("rateOfGrowth", growthVectors(), false),
    ...listLines("putZones", putZoneVectors(), false),
    `  "repairFixture": ${JSON.stringify(REPAIR_FIXTURE)},`,
    `  "repairDamage": ${JSON.stringify(REPAIR_DAMAGE)},`,
    ...listLines("repairs", repairVectors(), false),
    `  "sprites": ${JSON.stringify(spriteVector())}`,
    "}",
  ];
}

// --- speedGate.json: the steps at which each speed lets a phase through

// A fixture's city run past the step counter's wrap from 1023 to 0, which shifts the slow and medium gates
const GATE_FIXTURE = "suburb";
const GATE_STEPS = 2100;

async function speedGateLines(): Promise<string[]> {
  const speeds: {speed: RunningSpeed, speedCycle: number, phaseSteps: number[]}[] = [];
  for (const speed of RUNNING_SPEEDS) {
    const simulation = startFromSave(await builtSave(GATE_FIXTURE), {speed}) as unknown as Internals;
    const speedCycle = simulation._speedCycle;
    const original = simulation._simulate;
    const phaseSteps: number[] = [];
    let step = 0;

    simulation._simulate = function(this: Internals, simData: unknown) {
      phaseSteps.push(step);
      original.call(this, simData);
    };

    for (; step < GATE_STEPS; step++) {
      simulation.step();
    }

    speeds.push({speed, speedCycle, phaseSteps});
  }

  ensureCovers(speeds.every(({speedCycle}) => speedCycle + GATE_STEPS > 1024), "the step counter's wrap");

  return [
    "{",
    `  "fixture": ${JSON.stringify(GATE_FIXTURE)},`,
    `  "steps": ${GATE_STEPS},`,
    ...listLines("speeds", speeds, true),
    "}",
  ];
}

// --- snapshots/: unit snapshots, gzipped, with an index of them in plain text

const SNAPSHOTS_DIRECTORY = "snapshots";

const SNAPSHOT_INDEX = "index.json";

// What the snapshots may take in the repository, compressed: past it, fewer points are recorded rather than fewer units
const SNAPSHOT_LIMIT = 5 * 1024 * 1024;

// Writes the text gzipped, unless the file already holds it: comparing the text, never the gzip bytes, which another
// zlib may write differently, leaves an unchanged file's bytes alone for CI's check that nothing changed. A committed
// file that isn't gzip fails here rather than being overwritten, so a corrupted snapshot is seen.
function writeGzipped(name: string, text: string): number {
  const file = path.join(CONFORMANCE_DIRECTORY, name);

  if (!fs.existsSync(file) || zlib.gunzipSync(fs.readFileSync(file)).toString("utf8") !== text) {
    fs.writeFileSync(file, zlib.gzipSync(text, {level: 9}));
    console.log(`wrote ${file}`);
  }

  return fs.statSync(file).size;
}

// Removes every file of the directory but those written, so a file the generator no longer writes is gone
function removeUnwritten(directory: string, written: Set<string>): void {
  for (const entry of fs.readdirSync(directory)) {
    if (!written.has(entry)) {
      fs.rmSync(path.join(directory, entry));
    }
  }
}

function snapshotFile(record: SnapshotRecord): string {
  return `${record.fixture}.${record.unit}.json.gz`;
}

async function writeSnapshots(): Promise<void> {
  const directory = path.join(CONFORMANCE_DIRECTORY, SNAPSHOTS_DIRECTORY);
  fs.mkdirSync(directory, {recursive: true});

  const built = new Map<string, SaveData>();
  for (const fixture of Array.from(new Set([...SNAPSHOT_POINTS, ...COMMAND_POINTS].map((point) => point.fixture)))) {
    built.set(fixture, await builtSave(fixture));
  }

  const records = [...recordSnapshots(SNAPSHOT_POINTS, built), ...recordCommandSnapshots(COMMAND_POINTS, built)];
  const files: Record<string, SnapshotRecord[]> = {};
  for (const record of records) {
    (files[snapshotFile(record)] ??= []).push(record);
  }

  for (const unit of [...UNIT_NAMES, COMMAND_UNIT]) {
    ensureCovers(records.some((record) => record.unit === unit), `a snapshot of ${unit}`);
  }

  let size = 0;
  for (const [file, fileRecords] of Object.entries(files)) {
    size += writeGzipped(path.join(SNAPSHOTS_DIRECTORY, file), canonicalJson(fileRecords));
  }

  ensureCovers(size <= SNAPSHOT_LIMIT, `its points in ${SNAPSHOT_LIMIT} bytes: they take ${size}`);
  removeUnwritten(directory, new Set([SNAPSHOT_INDEX, ...Object.keys(files)]));

  const index = Object.entries(files).flatMap(([file, fileRecords]) => fileRecords.map((record, i) => ({
    file, record: i, fixture: record.fixture, unit: record.unit, speed: recordSpeed(record), step: record.step,
    args: record.args, handlers: record.handlers, reached: record.reached, events: record.events.map((event) => event.name),
  })));

  writeFile(path.join(SNAPSHOTS_DIRECTORY, SNAPSHOT_INDEX), ["{", ...listLines("snapshots", index, true), "}"]);
}

// --- migrated/: each sample save of saveVersions/ migrated to the current version and loaded

const SAVE_VERSIONS_DIRECTORY = "saveVersions";
const MIGRATED_DIRECTORY = "migrated";

// The oldest save version the C# port migrates: the first that holds the complete simulation state
const OLDEST_MIGRATED_VERSION = 5;

function writeMigrated(): void {
  fs.mkdirSync(path.join(CONFORMANCE_DIRECTORY, MIGRATED_DIRECTORY), {recursive: true});
  const versions = new Set<unknown>();

  for (const file of fs.readdirSync(path.join(CONFORMANCE_DIRECTORY, SAVE_VERSIONS_DIRECTORY)).sort()) {
    const text = fs.readFileSync(path.join(CONFORMANCE_DIRECTORY, SAVE_VERSIONS_DIRECTORY, file), "utf8");
    versions.add((JSON.parse(text) as {version: unknown}).version);
    writeText(path.join(MIGRATED_DIRECTORY, file),
              canonicalJson(plainSavedState(cityFromSave(SaveFormat.parse(text) as unknown as SaveData))));
  }

  for (let version = OLDEST_MIGRATED_VERSION; version <= SaveFormat.CURRENT_VERSION; version++) {
    ensureCovers(versions.has(version), `a sample save of version ${version}`);
  }
}

// --- commands.json: commands applied to a city, each with the result the simulation gave it

async function commandLines(): Promise<string[]> {
  const cases = [];
  const outcomes = new Set<string>();
  const reasons = new Set<string>();

  for (const commandCase of COMMAND_CASES) {
    const start = commandCase.fixture !== undefined ? await builtSave(commandCase.fixture) :
      plainSavedState(cityOnMap(new GameMap(commandCase.blankMap!.width, commandCase.blankMap!.height), Level.easy,
                                Speed.medium, 0)) as SaveData;
    const city = cityFromSave(start) as unknown as Internals;
    const results = city.applyCommands(commandCase.received) as {outcome: string, reason: string | null}[];
    results.forEach((result) => {
      outcomes.add(result.outcome);
      if (result.reason !== null) {
        reasons.add(result.reason.replace(/[0-9-][0-9e+.-]*/g, "#"));
      }
    });

    cases.push({
      description: commandCase.description,
      ...(commandCase.fixture !== undefined ? {fixture: commandCase.fixture} : {state: start}),
      results,
      hash: await hashSavedState(plainSavedState(city)),
    });
  }

  for (const outcome of OUTCOMES) {
    ensureCovers(outcomes.has(outcome), `the outcome ${outcome}`);
  }

  const missing = REJECTION_REASONS.filter((reason) => !reasons.has(reason));
  const unlisted = Array.from(reasons).filter((reason) => !REJECTION_REASONS.includes(reason));
  ensureCovers(missing.length === 0 && unlisted.length === 0,
               `every reason commandRejection gives: missing [${missing.join("; ")}], ` +
               `reached but not in REJECTION_REASONS [${unlisted.join("; ")}]`);

  return ["{", ...listLines("cases", cases, true), "}"];
}

// The reasons commandRejection gives, told apart by their words, with each number they quote written #. The cases must
// reach every one, and a reason they reach that isn't listed fails too, so a reason commandRejection gains is listed.
const REJECTION_REASONS = [
  "a command nests objects and lists at most # deep",
  "a command is at most # characters of JSON",
  "not a command",
  "the tool command has exactly the fields type, autoBulldoze, path, tool",
  "the setBudget command has exactly the fields type, tax, and may have fire, police, road",
  "the setSpeed command has exactly the fields type, speed",
  "the setAutoBudget command has exactly the fields type, on",
  "the setDisasters command has exactly the fields type, on",
  "the triggerDisaster command has exactly the fields type, kind",
  "the addFunds command has exactly the fields type",
  `the tool is one of ${TOOL_NAMES.join(", ")}`,
  "autoBulldoze is true or false",
  "a tool's path is a list of # to # tiles",
  "tile # of the path is not an {x, y} of whole numbers",
  "tile # of the path, (#, #), is off the #x# map",
  "tile # of the path, (#, #), is not next to the tile before it, (#, #)",
  "road funding is a whole percent from # to #",
  "fire funding is a whole percent from # to #",
  "police funding is a whole percent from # to #",
  "the tax rate is a whole percent from # to #",
  "the speed is a whole number from # to #",
  "setAutoBudget takes on, true or false",
  "setDisasters takes on, true or false",
  `the disaster is one of ${DISASTER_KINDS.join(", ")}`,
];

// --- logs/: command logs, which the C# replays to every checkpoint

const LOGS_DIRECTORY = "logs";

// A log that is no fixture's: the suburb's, with commands sent partway through its run, as a fixture's log, whose
// commands all precede its first step, never has. One step pauses the city, takes a command and resumes it.
const MID_RUN_LOG = "suburbMidRun";

const MID_RUN_BASE = "suburb";

const MID_RUN_ENTRIES: StampedCommand[] = [
  {step: 100, player: LOCAL_PLAYER, command: {type: "addFunds"}},
  {step: 700, player: LOCAL_PLAYER, command: {type: "tool", tool: "residential", path: [{x: 33, y: 21}], autoBulldoze: true}},
  {step: 700, player: LOCAL_PLAYER, command: {
    type: "tool", tool: "road", path: [{x: 31, y: 23}, {x: 32, y: 23}, {x: 33, y: 23}, {x: 34, y: 23}, {x: 35, y: 23}],
    autoBulldoze: true,
  }},
  {step: 1200, player: LOCAL_PLAYER, command: {type: "setSpeed", speed: Speed.paused}},
  {step: 1200, player: LOCAL_PLAYER, command: {type: "setBudget", tax: 12}},
  {step: 1200, player: LOCAL_PLAYER, command: {type: "setSpeed", speed: Speed.fast}},
];

const MID_RUN_STEPS = 2000;

// The mid-run log, with a checkpoint where it starts, at each step that applies commands, after them, and at its last
// step, each the state hash of the TypeScript's replay to it: a command applied a step early or late moves the hash at
// its own step
async function midRunLog(): Promise<CommandLog> {
  const base = fixtureLog(MID_RUN_BASE);
  const unchecked: CommandLog = {
    ...base, description: `The ${MID_RUN_BASE} fixture's log with commands sent partway through its run`,
    entries: [...base.entries, ...MID_RUN_ENTRIES], checkpoints: [],
  };

  const results = replay(unchecked, {to: MID_RUN_STEPS, verify: false}).results.slice(base.entries.length);
  ensureCovers(results.every((result) => result.outcome === "ok"), "a command applied partway through a run");

  const steps = Array.from(new Set([0, ...MID_RUN_ENTRIES.map((entry) => entry.step), MID_RUN_STEPS]));
  const checkpoints: Checkpoint[] = [];
  for (const step of steps) {
    checkpoints.push({step, hash: await stateHash(replay(unchecked, {to: step, verify: false}).city)});
  }

  return {...unchecked, checkpoints};
}

// A log in the game's format, laid out a line to each entry and each checkpoint, so a diff shows which moved, and a save
// it starts from on one line
function logLines(log: CommandLog): string[] {
  const {entries, checkpoints, ...start} = log;

  return [
    "{",
    ...Object.entries(start).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`),
    ...listLines("entries", entries, false),
    ...listLines("checkpoints", checkpoints, true),
    "}",
  ];
}

async function writeLogs(): Promise<void> {
  fs.mkdirSync(path.join(CONFORMANCE_DIRECTORY, LOGS_DIRECTORY));

  const logs: [string, CommandLog][] = fixtureNames().map((name) => [name, fixtureLog(name)]);
  logs.push([MID_RUN_LOG, await midRunLog()]);

  for (const [name, log] of logs) {
    const file = path.join(LOGS_DIRECTORY, `${name}.log.json`);
    writeFile(file, logLines(log));

    // Fails unless the file, read back as a replayer reads it, replays to every checkpoint
    await replay(parseLog(JSON.parse(fs.readFileSync(path.join(CONFORMANCE_DIRECTORY, file), "utf8")))).verified;
  }

  ensureCovers(logs.some(([, log]) => "seed" in log), "a log that starts from a seed");
  ensureCovers(logs.some(([, log]) => "save" in log), "a log that starts from a save");
}

// --- runs/: cities run at each speed, with their state hashes in plain text and their events gzipped

const RUNS_DIRECTORY = "runs";

const RUN_INDEX = "index.json";

// How often a run checks the state hash: every 16 cycles at fast speed
const RUN_CHECKPOINT_INTERVAL = 256;

// What the runs' events may take in the repository, compressed
const RUN_LIMIT = 5 * 1024 * 1024;

// A new city from each seed, at each level in turn, and each fixture's city as built
async function runStarts(seeds: number[]): Promise<RunStart[]> {
  const levels = Object.keys(Level) as LevelName[];
  const fixtures: RunStart[] = [];
  for (const fixture of fixtureNames()) {
    fixtures.push({fixture, built: await builtSave(fixture)});
  }

  return [...seeds.map((seed, i) => ({seed, level: levels[i % levels.length]})), ...fixtures];
}

function runFile(run: CityRun): string {
  return `${run.fixture ?? `seed${run.seed}`}.${run.speed}.json.gz`;
}

// A fixture's run at its saved speed is its golden run, which must end at its golden run hash
function checkGoldenRun(start: RunStart, run: CityRun): void {
  if (!("fixture" in start) || Speed[run.speed] !== start.built.simulation.speed) {
    return;
  }

  const goldens = fixtureLog(start.fixture).checkpoints;
  const golden = goldens[goldens.length - 1];
  const last = run.checkpoints[run.checkpoints.length - 1];
  if (golden.step !== last.step || golden.hash !== last.hash) {
    throw new Error(`${start.fixture}'s run at ${run.speed} speed ends at step ${last.step} with ${last.hash}, but its ` +
                    `golden run at step ${golden.step} with ${golden.hash}`);
  }
}

// Each start at each speed, once: a city that starts as another does, such as a fixture that differs from another only
// in its saved speed, makes the same run
async function recordRuns(starts: RunStart[]): Promise<CityRun[]> {
  const runs: CityRun[] = [];
  for (const start of starts) {
    for (const speed of RUNNING_SPEEDS) {
      const run = await recordRun(start, speed, RUN_STEPS, RUN_CHECKPOINT_INTERVAL);
      checkGoldenRun(start, run);

      if (!runs.some((other) => other.checkpoints[0].hash === run.checkpoints[0].hash)) {
        runs.push(run);
      }
    }
  }

  return runs;
}

function ensureRunsCover(runs: CityRun[]): void {
  for (const level of Object.keys(Level)) {
    ensureCovers(runs.some((run) => run.seed !== null && run.level === level), `a new city at the level ${level}`);
  }

  for (const run of runs.filter((run) => run.yearEnds === 0)) {
    ensureCovers(false, `a year end in ${describeStart(run)}'s run at ${run.speed} speed`);
  }

  const budgets = runs.flatMap((run) => run.budgets);
  ensureCovers(budgets.some((budget) => budget.autoBudget && !budget.shortfall), "a year's budget auto-budget paid");
  ensureCovers(budgets.some((budget) => budget.shortfall), "a year's budget auto-budget ran short of");
  ensureCovers(budgets.some((budget) => !budget.autoBudget), "a year's budget with auto-budget off");
  ensureCovers(runs.some((run) => run.sprites), "a run with a live sprite moving");
  for (const disaster of RANDOM_DISASTER_NAMES) {
    ensureCovers(runs.some((run) => run.disasters.includes(disaster)), `a run a random disaster strikes by ${disaster}`);
  }
}

async function writeRuns(seeds: number[]): Promise<void> {
  const directory = path.join(CONFORMANCE_DIRECTORY, RUNS_DIRECTORY);
  fs.mkdirSync(directory, {recursive: true});

  const runs = await recordRuns(await runStarts(seeds));
  ensureRunsCover(runs);

  let size = 0;
  for (const run of runs) {
    size += writeGzipped(path.join(RUNS_DIRECTORY, runFile(run)), canonicalJson(run.events));
  }

  ensureCovers(size <= RUN_LIMIT, `the runs' events in ${RUN_LIMIT} bytes: they take ${size}`);
  removeUnwritten(directory, new Set([RUN_INDEX, ...runs.map(runFile)]));

  const index = runs.map((run) => ({
    file: runFile(run), seed: run.seed, fixture: run.fixture, level: run.level, speed: run.speed, steps: run.steps,
    events: run.events.length, checkpoints: run.checkpoints,
  }));

  writeFile(path.join(RUNS_DIRECTORY, RUN_INDEX), ["{", ...listLines("runs", index, true), "}"]);
}

// --- traces/: calls into the sprites, the disasters and the transport handlers, gzipped, from the fixtures' saves

const TRACES_DIRECTORY = "traces";

// What the traces may take in the repository, compressed
const TRACE_LIMIT = 1024 * 1024;

async function writeTraces(): Promise<void> {
  const directory = path.join(CONFORMANCE_DIRECTORY, TRACES_DIRECTORY);
  fs.mkdirSync(directory, {recursive: true});

  const traces = await recordTraces(TRACES, writtenSave);
  const files = new Set(traces.map((trace) => `${trace.name}.json.gz`));

  let size = 0;
  for (const trace of traces) {
    size += writeGzipped(path.join(TRACES_DIRECTORY, `${trace.name}.json.gz`), canonicalJson(trace));
  }

  ensureCovers(size <= TRACE_LIMIT, `its traces in ${TRACE_LIMIT} bytes: they take ${size}`);
  removeUnwritten(directory, files);
}

// The files in conformance/ another program writes: random.c writes random.json
const WRITTEN_ELSEWHERE = new Set(["random.json"]);

// Removes what an earlier run wrote, so a file the generator no longer writes is gone rather than left committed
function clearWritten(): void {
  for (const entry of fs.readdirSync(CONFORMANCE_DIRECTORY)) {
    if (entry.endsWith(".json") && !WRITTEN_ELSEWHERE.has(entry)) {
      fs.rmSync(path.join(CONFORMANCE_DIRECTORY, entry));
    }
  }

  fs.rmSync(path.join(CONFORMANCE_DIRECTORY, SAVES_DIRECTORY), {recursive: true, force: true});
  fs.rmSync(path.join(CONFORMANCE_DIRECTORY, MIGRATED_DIRECTORY), {recursive: true, force: true});
  fs.rmSync(path.join(CONFORMANCE_DIRECTORY, LOGS_DIRECTORY), {recursive: true, force: true});
}

async function main() {
  clearWritten();
  writeFile("tiles.json", tileLines());
  writeFile("canonicalJson.json", canonicalJsonLines());
  const maps = chooseMaps();
  writeFile("maps.json", await mapLines(maps));
  writeFile("saveStrings.json", saveStringLines());
  writeFile("messages.json", ["{", ...namedLines("messages", Messages, true), "}"]);
  await writeSaves();
  writeFile("helpers.json", helperLines());
  writeFile("speedGate.json", await speedGateLines());
  writeFile("commands.json", await commandLines());
  writeMigrated();
  await writeLogs();
  await writeSnapshots();
  await writeRuns(maps.map((map) => map.seed));
  await writeTraces();
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
