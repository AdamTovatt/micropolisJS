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

import { writeFileSync } from "fs";
import { errorMessage } from "../src/errorMessage";
import {
  BudgetForecastAnswer, Command, OVERLAY_LAYERS, OverlayAnswer, OverlayLayer, QueryAnswer, SPEEDS, TOOL_NAMES, ToolName,
} from "../src/protocol";
import { Arguments, parseArguments, UsageError, wholeNumberOption } from "./args";
import { CityConnection, DEFAULT_SERVER, resolveTarget, Target } from "./cityConnection";
import { Area, MAP_LEGEND, mapText, overlayText } from "./mapText";
import { budgetText, resultText, statusText, tileReportText } from "./report";
import { fileSessionStore, sessionFilePath } from "./sessionFile";
import { LINE_TOOLS, linePath, parsePoint } from "./toolPath";

// The command line: a player of a city on the server, as a page is, who reads the city as text and sends the commands
// a page sends. Each run joins the city, does one thing, and leaves.

const USAGE = `Usage: npm run --silent micropolis -- [--city <link or id>] [--server <url>] <command> ...

The city is its link, the game's address with ?city=<id>, which names the server too, or its id, then the server is
--server's, MICROPOLIS_SERVER's or ${DEFAULT_SERVER}. MICROPOLIS_CITY gives the city when --city doesn't. Sessions are
kept in ${sessionFilePath()} (MICROPOLIS_SESSIONS moves it), one for each server.

Commands:
  sign-in <name>                  sign in to the server as a new player, once, before the rest
  status                          the date, funds, population, demand, power, conditions, evaluation and players
  map [<x,y> <x,y>]               the map as text, one character a tile, of the area between two corners;
                                  --legend says what the characters are
  tile <x,y>                      what the query tool reports of the tile
  overlay <layer> [<x,y> <x,y>]   an overlay's values, a digit from 0 to 9 a block; the layers are
                                  ${OVERLAY_LAYERS.join(", ")}
  budget                          the budget, and what the year end would do now
         [--tax n] [--road n] [--fire n] [--police n]
                                  sets the tax rate (0-20) and the services' funding (0-100), in percent
  build <tool> <x,y> ...          applies the tool: road, rail, wire, bulldozer and park along the line through the
                                  tiles, along each row and then each column; every other tool once at each tile, a
                                  building's centre. The tools are ${TOOL_NAMES.join(", ")}.
                                  --no-auto-bulldoze leaves what's there for the bulldozer.
  speed <paused|slow|medium|fast> sets the city's speed
  auto-budget <on|off>
  disasters <on|off>
  save                            keeps the city in the server's store
  download <file>                 writes the city's save to the file`;

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArguments(argv);
  const [command, ...words] = args.words;

  if (command === undefined || command === "help" || args.switches.has("help")) {
    console.log(USAGE);
    return;
  }

  const target = resolveTarget(args.options.get("city") ?? process.env.MICROPOLIS_CITY, args.options.get("server"));
  const store = fileSessionStore(sessionFilePath(), target.origin);

  if (command === "sign-in") {
    if (words.length === 0) {
      throw new UsageError("sign-in needs the name to sign in under");
    }

    const name = await CityConnection.signIn(target.origin, store, words.join(" "));
    console.log(`Signed in to ${target.origin} as ${name}`);
    return;
  }

  const run = CITY_COMMANDS[command];
  if (run === undefined) {
    throw new UsageError(`There is no command ${command}`);
  }

  const city = cityOf(target);
  const connection = await CityConnection.open(target.origin, store);

  try {
    const started = await connection.join(city);
    await run(connection, words, args, started.name);
  } finally {
    connection.close();
  }
}

type CityCommand = (connection: CityConnection, words: string[], args: Arguments, name: string) => Promise<void>;

const CITY_COMMANDS: Record<string, CityCommand> = {
  status: async (connection, words, _args, name) => {
    noMoreWords(words, 0);
    const {state} = connection;
    console.log(statusText(name, {
      date: state.current("date"),
      population: state.current("population"),
      budget: state.current("budget"),
      evaluation: state.current("evaluation"),
      settings: state.current("settings"),
      status: state.latest("status"),
      demand: state.latest("demand"),
    }, connection.players()));
  },

  map: async (connection, words, args) => {
    const {map} = connection.state;
    const grid = {width: map.width, height: map.height, tiles: map.getTileValuesForPainting(0, 0, map.width, map.height, [])};
    console.log(mapText(grid, areaOf(words, map.width, map.height)));
    if (args.switches.has("legend")) {
      console.log("\n" + MAP_LEGEND);
    }
  },

  tile: async (connection, words) => {
    noMoreWords(words, 1);
    const {x, y} = parsePoint(needWord(words, 0, "the tile"));
    console.log(tileReportText(answerOf(await connection.ask({type: "tileReport", x, y}), "tileReport")));
  },

  overlay: async (connection, words) => {
    const layer = needWord(words, 0, "the layer");
    if (!(OVERLAY_LAYERS as readonly string[]).includes(layer)) {
      throw new UsageError(`There is no layer ${layer}: the layers are ${OVERLAY_LAYERS.join(", ")}`);
    }

    const {map} = connection.state;
    const answer: OverlayAnswer = answerOf(await connection.ask({type: "overlay", layer: layer as OverlayLayer}), "overlay");
    console.log(`${layer}, from ${answer.low} (0) to ${answer.high} (9), ${answer.blockSize} tiles a block`);
    console.log(overlayText(answer, areaOf(words.slice(1), map.width, map.height), map.width, map.height));
  },

  budget: async (connection, words, args) => {
    noMoreWords(words, 0);
    const tax = wholeNumberOption(args, "tax", 0, 20);
    const road = wholeNumberOption(args, "road", 0, 100);
    const fire = wholeNumberOption(args, "fire", 0, 100);
    const police = wholeNumberOption(args, "police", 0, 100);

    // A service left out keeps its funding, and the tax rate its rate
    if (tax !== undefined || road !== undefined || fire !== undefined || police !== undefined) {
      const command: Command = {
        type: "setBudget",
        ...(road === undefined ? {} : {road}),
        ...(fire === undefined ? {} : {fire}),
        ...(police === undefined ? {} : {police}),
        tax: tax ?? connection.state.current("budget").taxRate,
      };
      await applyAndReport(connection, [command], ["budget"]);
    }

    const forecast: BudgetForecastAnswer = answerOf(await connection.ask({type: "budgetForecast"}), "budgetForecast");
    console.log(budgetText(forecast));
  },

  build: async (connection, words, args) => {
    const tool = needWord(words, 0, "the tool");
    if (!(TOOL_NAMES as readonly string[]).includes(tool)) {
      throw new UsageError(`There is no tool ${tool}: the tools are ${TOOL_NAMES.join(", ")}`);
    }

    const points = words.slice(1).map(parsePoint);
    if (points.length === 0) {
      throw new UsageError("build needs at least one tile, as x,y");
    }

    const autoBulldoze = !args.switches.has("no-auto-bulldoze");
    const toolName = tool as ToolName;

    if (LINE_TOOLS.has(toolName)) {
      const path = linePath(points);
      const label = `${tool} through ${words.slice(1).join(" ")}, ${path.length} tiles`;
      await applyAndReport(connection, [{type: "tool", tool: toolName, path, autoBulldoze}], [label]);
    } else {
      await applyAndReport(connection,
        points.map((point) => ({type: "tool", tool: toolName, path: [point], autoBulldoze})),
        points.map(({x, y}) => `${tool} at ${x},${y}`));
    }

    console.log(`Funds $${connection.state.current("budget").funds}`);
  },

  speed: async (connection, words) => {
    noMoreWords(words, 1);
    const speed = needWord(words, 0, "the speed");
    if (!(speed in SPEEDS)) {
      throw new UsageError(`There is no speed ${speed}: the speeds are ${Object.keys(SPEEDS).join(", ")}`);
    }

    await applyAndReport(connection, [{type: "setSpeed", speed: SPEEDS[speed as keyof typeof SPEEDS]}], [speed]);
  },

  "auto-budget": async (connection, words) => {
    noMoreWords(words, 1);
    const on = onOff(needWord(words, 0, "on or off"));
    await applyAndReport(connection, [{type: "setAutoBudget", on}], [`auto-budget ${words[0]}`]);
  },

  disasters: async (connection, words) => {
    noMoreWords(words, 1);
    const on = onOff(needWord(words, 0, "on or off"));
    await applyAndReport(connection, [{type: "setDisasters", on}], [`disasters ${words[0]}`]);
  },

  save: async (connection, words) => {
    noMoreWords(words, 0);
    await connection.save();
    console.log("Saved");
  },

  download: async (connection, words) => {
    noMoreWords(words, 1);
    const file = needWord(words, 0, "the file to write");
    writeFileSync(file, await connection.download());
    console.log(`Wrote ${file}`);
  },
};

// Sends the commands, and prints what came of each beside its label
async function applyAndReport(connection: CityConnection, commands: Command[], labels: string[]): Promise<void> {
  const results = await connection.apply(commands);
  results.forEach((result, i) => console.log(`${labels[i]}: ${resultText(result)}`));
}

function cityOf(target: Target): string {
  if (target.city === null) {
    throw new UsageError("Which city? Give its link or id with --city, or in MICROPOLIS_CITY");
  }

  return target.city;
}

// The area between the two corners given, or the whole map
function areaOf(words: readonly string[], width: number, height: number): Area {
  if (words.length === 0) {
    return {left: 0, top: 0, right: width - 1, bottom: height - 1};
  }

  if (words.length !== 2) {
    throw new UsageError("An area is two corners, as x,y x,y");
  }

  const [a, b] = words.map(parsePoint);
  return {left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y)};
}

function answerOf<T extends QueryAnswer["type"]>(answer: QueryAnswer, type: T): Extract<QueryAnswer, {type: T}> {
  if (answer.type === "rejected") {
    throw new Error(`The city rejected the query: ${answer.reason}`);
  }

  if (answer.type !== type) {
    throw new Error(`The city answered a ${type} query with ${answer.type}`);
  }

  return answer as Extract<QueryAnswer, {type: T}>;
}

function needWord(words: readonly string[], index: number, what: string): string {
  const word = words[index];
  if (word === undefined) {
    throw new UsageError(`Give ${what}`);
  }

  return word;
}

function noMoreWords(words: readonly string[], count: number): void {
  if (words.length > count) {
    throw new UsageError(`Unexpected ${words.slice(count).join(" ")}`);
  }
}

function onOff(word: string): boolean {
  if (word !== "on" && word !== "off") {
    throw new UsageError(`Give on or off, not ${word}`);
  }

  return word === "on";
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
  } else {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
});
