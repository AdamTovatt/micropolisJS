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

import { CommandLog } from "../../src/commandLog";
import { broke, underfunded } from "./budgets";
import { suburb, suburbBroke, suburbUnderfunded } from "./suburb";
import { town } from "./town";

// What a fixture is for in the unit snapshots, which are recorded only from cities that create no sprites:
// - "sprites": its run creates sprites, so no snapshot is recorded from it
// - "snapshots": sprite-free, and every unit's first calls are recorded from it, with the points that name it
// - "branch": sprite-free, made for a branch of a unit, and records only the points that name it
export type FixtureKind = "sprites" | "snapshots" | "branch";

// Every fixture, by name, with its kind. A fixture is a command log: a city built afresh by replaying its commands
// whenever it is used, so no stored state can go stale when a rule changes. `npm run fixtures` exports each one's log,
// which is never read back. The copies of its state in conformance/saves/ are for the C# tests.
const fixtures: Record<string, {log: CommandLog, kind: FixtureKind}> = {
  broke: {log: broke, kind: "sprites"},
  suburb: {log: suburb, kind: "snapshots"},
  suburbBroke: {log: suburbBroke, kind: "snapshots"},
  suburbUnderfunded: {log: suburbUnderfunded, kind: "snapshots"},
  town: {log: town, kind: "sprites"},
  underfunded: {log: underfunded, kind: "sprites"},
};

export function fixtureNames(): string[] {
  return Object.keys(fixtures).sort();
}

// The fixtures of the kinds given, in name order
export function fixtureNamesOf(...kinds: FixtureKind[]): string[] {
  return fixtureNames().filter((name) => kinds.includes(fixtures[name].kind));
}

// The fixtures that create no sprites in their runs, which the unit snapshots are recorded from
export function spriteFreeFixtureNames(): string[] {
  return fixtureNamesOf("snapshots", "branch");
}

export function fixtureLog(name: string): CommandLog {
  if (!(name in fixtures)) {
    throw new Error(`No fixture named ${name}: the fixtures are ${fixtureNames().join(", ")}`);
  }

  return fixtures[name].log;
}
