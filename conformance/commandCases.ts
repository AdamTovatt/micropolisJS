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

// The commands conformance/commands.json lists (conformance/README.md): commands applied in order to a city, each with
// the result the simulation gave it. Every reason commandRejection gives is reached, and every outcome.

import { maxCommandLength, ReceivedCommand } from "../src/commands";
import { DISASTER_KINDS, LOCAL_PLAYER } from "../src/protocol";

export interface CommandCase {
  description: string;
  // The city the commands apply to: a fixture's built save, or a new city on a blank map of this size
  fixture?: string;
  blankMap?: {width: number, height: number};
  received: ReceivedCommand[];
}

// Another player, whose commands the simulation treats as any player's
const OTHER_PLAYER = "ada";

// Commands as single player sends them
export function local(...commands: unknown[]): ReceivedCommand[] {
  return commands.map((command) => ({player: LOCAL_PLAYER, command}));
}

const tile = (x: number, y: number) => ({x, y});

function tool(name: unknown, path: unknown, autoBulldoze: unknown = true): object {
  return {type: "tool", tool: name, path, autoBulldoze};
}

// A command whose JSON is exactly the length given: a type that is no command, of the character given repeated, which
// JSON.stringify may write escaped, and then "x"s to make the length up
function typeOfLength(length: number, character = "x"): object {
  const frame = JSON.stringify({type: ""}).length;
  const written = JSON.stringify(character).length - 2;
  const count = Math.floor((length - frame) / written);
  return exactly(length, {type: character.repeat(count) + "x".repeat(length - frame - count * written)});
}

// The same with the characters in a key of the command rather than its type
function keyOfLength(length: number, character: string): object {
  const frame = JSON.stringify({type: "x", "": 0}).length;
  const written = JSON.stringify(character).length - 2;
  const count = Math.floor((length - frame) / written);
  return exactly(length, {type: "x", [character.repeat(count) + "x".repeat(length - frame - count * written)]: 0});
}

// A command that is no command, padded to the length given by numbers, which JSON.stringify writes as
// Number::toString does, and then "x"s
function numbersOfLength(length: number): object {
  const numbers = [1e21, 1.5e-7, 123.456, -0.000001, 1e-7, 2 ** 53, 100];
  const pad: number[] = [];
  while (JSON.stringify({type: "x", pad, s: ""}).length + 30 < length) {
    pad.push(numbers[pad.length % numbers.length]);
  }

  return exactly(length, {type: "x", pad, s: "x".repeat(length - JSON.stringify({type: "x", pad, s: ""}).length)});
}

// Lists nested this many deep, an object innermost
function nested(levels: number): unknown {
  let value: unknown = {};
  for (let i = 1; i < levels; i++) {
    value = [value];
  }

  return value;
}

function exactly(length: number, command: object): object {
  if (JSON.stringify(command).length !== length) {
    throw new Error(`A command meant to be ${length} long is ${JSON.stringify(command).length}`);
  }

  return command;
}

// The small map whose commands' longest is short enough to list one either side of it
const SMALL = {width: 8, height: 8};
const SMALL_MAX = maxCommandLength(SMALL.width, SMALL.height);

export const COMMAND_CASES: CommandCase[] = [
  {
    description: "What is not a command, and commands with the wrong fields",
    fixture: "suburb",
    received: local(
      null, [], "tool", 7, true, {}, {type: 5}, {type: null}, {type: "build"}, {type: "Tool"}, {kind: "fire"},
      {type: "tool"},
      {type: "tool", tool: "road", path: [tile(1, 1)], autoBulldoze: true, speed: 2},
      {type: "setBudget"},
      {type: "setBudget", tax: 7, roads: 100},
      {type: "setSpeed", speed: 1, on: true},
      {type: "setAutoBudget"},
      {type: "setDisasters", on: true, kind: "fire"},
      {type: "triggerDisaster"},
      {type: "addFunds", amount: 20000},
      {type: "addFunds", ["__proto__"]: 1},
      // The command is the first level, so a pad nested 63 deep is read on, and one 64 deep is too deep
      {type: "addFunds", pad: nested(63)},
      {type: "addFunds", pad: nested(64)},
    ),
  },
  {
    description: "Tool commands rejected for their tool, their setting or their path",
    fixture: "suburb",
    received: local(
      tool("hammer", [tile(1, 1)]), tool("Road", [tile(1, 1)]), tool(3, [tile(1, 1)]), tool(null, [tile(1, 1)]),
      tool("road", [tile(1, 1)], "yes"), tool("road", [tile(1, 1)], 1), tool("road", [tile(1, 1)], null),
      tool("road", {}), tool("road", []), tool("road", "1,1"), tool("road", null),
      tool("road", [5]), tool("road", [[1, 1]]), tool("road", [null]),
      tool("road", [{x: 1}]), tool("road", [{x: 1, y: 1, z: 1}]), tool("road", [{x: 1, y: 1, type: "tile"}]),
      tool("road", [{x: 1.5, y: 1}]),
      tool("road", [{x: "1", y: 1}]), tool("road", [{x: 1, y: null}]), tool("road", [{x: 1, y: true}]),
      tool("road", [tile(120, 0)]), tool("road", [tile(0, 100)]), tool("road", [tile(-1, 5)]),
      tool("road", [tile(1e21, 0)]), tool("road", [tile(0, -1e21)]),
      tool("road", [tile(1, 1), tile(2, 2)]), tool("road", [tile(1, 1), tile(1, 1)]),
      tool("road", [tile(1, 1), tile(1, 2), tile(1, 4)]), tool("road", [tile(1, 1), tile(1, 2), {x: 1.5, y: 2}]),
      tool("road", [tile(119, 99), tile(120, 99)]),
    ),
  },
  {
    description: "Settings commands rejected for a value out of range or of the wrong kind",
    fixture: "suburb",
    received: local(
      {type: "setBudget", tax: 21}, {type: "setBudget", tax: -1}, {type: "setBudget", tax: 7.5},
      {type: "setBudget", tax: "7"}, {type: "setBudget", tax: null},
      {type: "setBudget", road: 101, tax: 7}, {type: "setBudget", fire: -1, tax: 7},
      {type: "setBudget", police: 50.5, tax: 7}, {type: "setBudget", road: "50", tax: 7},
      {type: "setBudget", road: null, tax: 7}, {type: "setBudget", police: 101, fire: 101, tax: 99},
      {type: "setSpeed", speed: 4}, {type: "setSpeed", speed: -1}, {type: "setSpeed", speed: 1.5},
      {type: "setSpeed", speed: "2"}, {type: "setSpeed", speed: null},
      {type: "setAutoBudget", on: 1}, {type: "setAutoBudget", on: "true"}, {type: "setAutoBudget", on: null},
      {type: "setDisasters", on: 0}, {type: "setDisasters", on: "false"},
      // No disaster kind, and one in the wrong case
      {type: "triggerDisaster", kind: "volcano"}, {type: "triggerDisaster", kind: "Fire"},
      {type: "triggerDisaster", kind: 1},
    ),
  },
  {
    description: "Commands the simulation applies, from two players, with fields in any order",
    fixture: "suburb",
    received: [
      ...local(
        {type: "setBudget", tax: 9},
        {type: "setBudget", road: 50, fire: 0, police: 100, tax: 0},
        {tax: 20, police: 75, type: "setBudget"},
        {type: "setSpeed", speed: 3}, {type: "setSpeed", speed: 3}, {type: "setSpeed", speed: 0},
        {type: "setAutoBudget", on: false}, {type: "setAutoBudget", on: true},
        {type: "setDisasters", on: true}, {type: "setDisasters", on: false},
      ),
      {player: OTHER_PLAYER, command: {type: "addFunds"}},
      {player: OTHER_PLAYER, command: {autoBulldoze: false, path: [tile(62, 31)], tool: "park", type: "tool"}},
    ],
  },
  {
    description: "Tool commands with each outcome: ok, failed, needing the bulldozer, and with no money",
    fixture: "suburbBroke",
    received: local(
      // A road across open ground
      tool("road", [tile(52, 31), tile(53, 31), tile(54, 31)], false),
      // Across open ground into trees, which it can't clear without auto-bulldoze: the outcome is the tile that failed
      tool("road", [tile(61, 32), tile(61, 31), tile(61, 30)], false),
      // A zone where trees stand
      tool("residential", [tile(54, 24)], false),
      // A zone off the map's edge
      tool("industrial", [tile(0, 50)], true),
      // More than the city has: refused for want of money, after the road it could pay for
      tool("airport", [tile(66, 36)], true),
      tool("road", [tile(60, 40), tile(61, 40)], false),
    ),
  },
  {
    description: "Commands as long as a command may be on a small map, and one longer",
    blankMap: SMALL,
    received: local(
      typeOfLength(SMALL_MAX),
      typeOfLength(SMALL_MAX + 1),
      // Each escaped character counts as JSON.stringify writes it, either side of the longest
      ...["\n", "\"", "\\", "\u0001", "\u001f", "\ud800", "\udfff", "😀", "é"].flatMap((character) =>
        [typeOfLength(SMALL_MAX, character), typeOfLength(SMALL_MAX + 1, character)]),
      // In a key as in a value
      ...["\n", "\ud800", "😀"].flatMap((character) =>
        [keyOfLength(SMALL_MAX, character), keyOfLength(SMALL_MAX + 1, character)]),
      // And each number as Number::toString writes it
      numbersOfLength(SMALL_MAX), numbersOfLength(SMALL_MAX + 1),
      // A path longer than the map has tiles, and a tile off the small map
      tool("road", Array.from({length: SMALL.width * SMALL.height + 1}, () => tile(0, 0))),
      tool("road", [tile(8, 0)]),
      // A command the small map takes
      tool("road", [tile(0, 0), tile(1, 0)], false),
    ),
  },
  // Each disaster triggered alone, so the hash after it shows what it did: the meltdown in the broke suburb, which has
  // a nuclear plant, and every other in the town
  ...DISASTER_KINDS.map((kind): CommandCase => ({
    description: `A ${kind} triggered`,
    fixture: kind === "meltdown" ? "suburbBroke" : "town",
    received: local({type: "triggerDisaster", kind}),
  })),
];
