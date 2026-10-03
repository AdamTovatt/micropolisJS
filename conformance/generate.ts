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
import { fixtureLog, fixtureNames } from "../headless/fixtures/index";
import { replay } from "../headless/runner";
import { canonicalJson } from "../src/canonicalJson";
import { MapGenerator } from "../src/mapGenerator.js";
import * as Messages from "../src/messages";
import { CITY_CLASSES, SCORE_REASONS } from "../src/protocol";
import { Random } from "../src/random";
import { hashSavedState, savedState } from "../src/stateHash";
import * as TileFlags from "../src/tileFlags";
import * as TileValues from "../src/tileValues";

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

async function mapLines(): Promise<string[]> {
  const chosen = chooseMaps();
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
}

async function main() {
  clearWritten();
  writeFile("tiles.json", tileLines());
  writeFile("canonicalJson.json", canonicalJsonLines());
  writeFile("maps.json", await mapLines());
  writeFile("saveStrings.json", saveStringLines());
  await writeSaves();
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
