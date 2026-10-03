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

import { Checkpoint, CommandLog } from "../../src/commandLog";
import { StampedCommand } from "../../src/commandQueue";
import { Simulation } from "../city";
import { forestFire, overloaded, twinPlants, wilderness } from "./branches";
import { broke, underfunded } from "./budgets";
import { disasters } from "./disasters";
import { suburb, suburbBroke, suburbFast, suburbSlow, suburbUnderfunded } from "./suburb";
import { town } from "./town";

// A fixture that needs what no command places: the city another fixture's log builds, which `save` writes into and
// returns the saved state of. Its log starts from that state. The runner builds the log (fixtureLog in runner.ts),
// since only it can replay the other fixture's.
export interface DerivedFixture {
  from: CommandLog;
  save(city: Simulation): object;
  description: string;
  entries: StampedCommand[];
  checkpoints: Checkpoint[];
}

export type Fixture = CommandLog | DerivedFixture;

// What a fixture is for in the unit snapshots, which are recorded only from cities that create no sprites:
// - "sprites": its run creates sprites, so no snapshot is recorded from it
// - "snapshots": sprite-free, and every unit's first calls are recorded from it, with the points that name it
// - "branch": sprite-free, made for a branch of a unit, and records only the points that name it
export type FixtureKind = "sprites" | "snapshots" | "branch";

// Every fixture, by name, with its kind. A fixture is a command log, or for a derived fixture what the runner builds
// one from: a city built afresh by replaying commands whenever it is used, so no stored state can go stale when a rule
// changes. `npm run fixtures` exports each one's log, which is never read back. The copies of its state in
// conformance/saves/ are for the C# tests.
const fixtures: Record<string, {fixture: Fixture, kind: FixtureKind}> = {
  broke: {fixture: broke, kind: "sprites"},
  disasters: {fixture: disasters, kind: "branch"},
  forestFire: {fixture: forestFire, kind: "branch"},
  overloaded: {fixture: overloaded, kind: "branch"},
  suburb: {fixture: suburb, kind: "snapshots"},
  suburbBroke: {fixture: suburbBroke, kind: "snapshots"},
  suburbFast: {fixture: suburbFast, kind: "branch"},
  suburbSlow: {fixture: suburbSlow, kind: "branch"},
  suburbUnderfunded: {fixture: suburbUnderfunded, kind: "snapshots"},
  town: {fixture: town, kind: "sprites"},
  twinPlants: {fixture: twinPlants, kind: "branch"},
  underfunded: {fixture: underfunded, kind: "sprites"},
  wilderness: {fixture: wilderness, kind: "branch"},
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

export function namedFixture(name: string): Fixture {
  if (!(name in fixtures)) {
    throw new Error(`No fixture named ${name}: the fixtures are ${fixtureNames().join(", ")}`);
  }

  return fixtures[name].fixture;
}
