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
import { town } from "./town";

// Every fixture, by name. A fixture is a command log: a city built afresh by replaying its commands whenever it is
// used, so no stored state can go stale when a rule changes. `npm run fixtures` exports each one's log, which is never
// read back. The copies of its state in conformance/saves/ are for the C# tests, and CI fails unless they are what
// replaying it writes.
const fixtures: Record<string, CommandLog> = {broke, town, underfunded};

export function fixtureNames(): string[] {
  return Object.keys(fixtures).sort();
}

export function fixtureLog(name: string): CommandLog {
  if (!(name in fixtures)) {
    throw new Error(`No fixture named ${name}: the fixtures are ${fixtureNames().join(", ")}`);
  }

  return fixtures[name];
}
