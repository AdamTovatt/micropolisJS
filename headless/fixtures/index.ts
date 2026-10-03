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

import { plainSavedState } from "../../src/stateHash";
import { SaveData } from "../city";
import { buildFixture, Fixture } from "./builder";
import { town } from "./town";

// Every fixture, by name. A fixture is defined by its build script, and is built afresh whenever it is used: a
// stored copy would go stale silently when a rule changes. `npm run fixtures` exports each one's saved state as
// JSON, which is never read back.
export const fixtures: Record<string, Fixture> = {town};

export function fixtureNames(): string[] {
  return Object.keys(fixtures).sort();
}

// The saved state the fixture's script builds, as plain data shared with nothing
export function fixtureSave(name: string): SaveData {
  if (!(name in fixtures)) {
    throw new Error(`No fixture named ${name}: the fixtures are ${fixtureNames().join(", ")}`);
  }

  return plainSavedState(buildFixture(fixtures[name])) as SaveData;
}
