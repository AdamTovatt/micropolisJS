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

// Every fixture, by name. A fixture is a command log: a city built afresh by replaying its commands whenever it is
// used, so no stored state can go stale when a rule changes. `npm run fixtures` exports each one's log, which is never
// read back. The copies of its state in conformance/saves/ are for the C# tests.
const fixtures: Record<string, CommandLog> = {broke, suburb, suburbBroke, suburbUnderfunded, town, underfunded};

// The fixtures that create no sprites in their runs, which the unit snapshots are recorded from
const spriteFree: CommandLog[] = [suburb, suburbBroke, suburbUnderfunded];

export function fixtureNames(): string[] {
  return Object.keys(fixtures).sort();
}

export function spriteFreeFixtureNames(): string[] {
  return fixtureNames().filter((name) => spriteFree.includes(fixtures[name]));
}

export function fixtureLog(name: string): CommandLog {
  if (!(name in fixtures)) {
    throw new Error(`No fixture named ${name}: the fixtures are ${fixtureNames().join(", ")}`);
  }

  return fixtures[name];
}
