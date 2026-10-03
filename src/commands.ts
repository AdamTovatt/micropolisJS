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

import { Command, CommandType, DISASTER_KINDS, TilePosition, TOOL_NAMES } from "./protocol";
import { SERVICES } from "./serviceFunding";

// How the simulation takes the commands a player sends it, which protocol.ts defines. They arrive untrusted: the
// simulation validates each one before it applies it, and never branches on which player sent it.

// The ranges the budget window offers, in whole percent
export const MAX_FUNDING_PERCENT = 100;
export const MAX_TAX_PERCENT = 20;

// The speeds, as Simulation numbers them: 0 is paused
export const MAX_SPEED = 3;

// A player's id. Single player has the one player.
export type PlayerId = string;

export const LOCAL_PLAYER: PlayerId = "local";

// A command as it arrives, from the player who sent it
export interface ReceivedCommand {
  player: PlayerId;
  command: unknown;
}

// What came of a command. A tool command is ok when the tool succeeded at every tile of its path, and otherwise takes
// the outcome of the first tile where it didn't, which the tool output shows.
export type Outcome = "ok" | "failed" | "noMoney" | "needsBulldoze" | "rejected";

export interface CommandResult {
  player: PlayerId;
  command: unknown;
  outcome: Outcome;
  // Why the command was rejected, or null when it wasn't
  reason: string | null;
}

type FieldRule = "required" | "optional";

// Whether each of a command's fields but its type must be there, as its Command type says
type FieldRules<C> = {[K in Exclude<keyof C, "type">]: undefined extends C[K] ? "optional" : "required"};

// Each command's fields but its type: a command missing a required one, or with any other, is rejected. The compiler
// holds the table to the Command type, both ways: a field one has and the other lacks is a type error.
const FIELDS = {
  tool: {autoBulldoze: "required", path: "required", tool: "required"},
  setBudget: {fire: "optional", police: "optional", road: "optional", tax: "required"},
  setSpeed: {speed: "required"},
  setAutoBudget: {on: "required"},
  setDisasters: {on: "required"},
  triggerDisaster: {kind: "required"},
  addFunds: {},
} satisfies {[T in CommandType]: FieldRules<Extract<Command, {type: T}>>};

// The longest a command may be, as the JSON text JSON.stringify writes for it, in UTF-16 code units: room for a tool
// command whose path covers the whole map. A log holds every command as it arrived, rejected ones included, so this
// bounds what a hostile player can make it hold.
export function maxCommandLength(width: number, height: number): number {
  return 32 * width * height + 1024;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldsWith(rules: Record<string, FieldRule>, rule: FieldRule): string[] {
  return Object.keys(rules).filter((field) => rules[field] === rule).sort();
}

// Whether the keys, but the one left out, are every required field and otherwise only optional ones
function hasFields(value: Record<string, unknown>, rules: Record<string, FieldRule>, leaveOut?: string): boolean {
  const keys = Object.keys(value).filter((key) => key !== leaveOut);
  return fieldsWith(rules, "required").every((field) => keys.includes(field)) &&
         keys.every((key) => Object.prototype.hasOwnProperty.call(rules, key));
}

export function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isWholeNumberIn(value: unknown, min: number, max: number): boolean {
  return isWholeNumber(value) && value >= min && value <= max;
}

function oneOf(value: unknown, values: readonly string[]): boolean {
  return typeof value === "string" && values.indexOf(value) !== -1;
}

function pathRejection(path: unknown, width: number, height: number): string | null {
  // A path longer than the map has tiles must revisit one
  if (!Array.isArray(path) || path.length === 0 || path.length > width * height) {
    return `a tool's path is a list of 1 to ${width * height} tiles`;
  }

  for (let i = 0; i < path.length; i++) {
    const tile: unknown = path[i];
    if (!isRecord(tile) || !hasFields(tile, {x: "required", y: "required"}) || !isWholeNumber(tile.x) || !isWholeNumber(tile.y)) {
      return `tile ${i} of the path is not an {x, y} of whole numbers`;
    }

    if (!isWholeNumberIn(tile.x, 0, width - 1) || !isWholeNumberIn(tile.y, 0, height - 1)) {
      return `tile ${i} of the path, (${tile.x}, ${tile.y}), is off the ${width}x${height} map`;
    }

    if (i > 0) {
      const last = path[i - 1] as TilePosition;
      if (Math.abs(tile.x - last.x) + Math.abs(tile.y - last.y) !== 1) {
        return `tile ${i} of the path, (${tile.x}, ${tile.y}), is not next to the tile before it, ` +
               `(${last.x}, ${last.y})`;
      }
    }
  }

  return null;
}

// Why the simulation rejects this command on a map of this size, or null when it is valid. A valid command is a
// Command: exactly its type's fields, each in the range the game offers. A reason quotes no value from the command
// but a coordinate already checked to be a number, so a hostile command can't make it long.
export function commandRejection(command: unknown, width: number, height: number): string | null {
  const maxLength = maxCommandLength(width, height);
  // JSON.stringify writes nothing for undefined, which is not a command either
  if ((JSON.stringify(command) ?? "").length > maxLength) {
    return `a command is at most ${maxLength} characters of JSON`;
  }

  if (!isRecord(command) || !oneOf(command.type, Object.keys(FIELDS))) {
    return "not a command";
  }

  const type = command.type as CommandType;
  const rules: Record<string, FieldRule> = FIELDS[type];
  if (!hasFields(command, rules, "type")) {
    const optional = fieldsWith(rules, "optional");
    return `the ${type} command has exactly the fields ${["type", ...fieldsWith(rules, "required")].join(", ")}` +
           (optional.length === 0 ? "" : `, and may have ${optional.join(", ")}`);
  }

  switch (type) {
    case "tool":
      if (!oneOf(command.tool, TOOL_NAMES)) {
        return `the tool is one of ${TOOL_NAMES.join(", ")}`;
      }

      if (typeof command.autoBulldoze !== "boolean") {
        return "autoBulldoze is true or false";
      }

      return pathRejection(command.path, width, height);

    case "setBudget":
      for (const service of SERVICES) {
        if (service in command && !isWholeNumberIn(command[service], 0, MAX_FUNDING_PERCENT)) {
          return `${service} funding is a whole percent from 0 to ${MAX_FUNDING_PERCENT}`;
        }
      }

      if (!isWholeNumberIn(command.tax, 0, MAX_TAX_PERCENT)) {
        return `the tax rate is a whole percent from 0 to ${MAX_TAX_PERCENT}`;
      }

      return null;

    case "setSpeed":
      return isWholeNumberIn(command.speed, 0, MAX_SPEED) ? null : `the speed is a whole number from 0 to ${MAX_SPEED}`;

    case "setAutoBudget":
    case "setDisasters":
      return typeof command.on === "boolean" ? null : `${type} takes on, true or false`;

    case "triggerDisaster":
      return oneOf(command.kind, DISASTER_KINDS) ? null : `the disaster is one of ${DISASTER_KINDS.join(", ")}`;

    case "addFunds":
      return null;
  }
}
