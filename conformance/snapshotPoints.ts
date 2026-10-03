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

// The calls the unit snapshots record (conformance/README.md): each unit's first calls in each sprite-free fixture,
// and the points a unit's rarer branches need, which name the branch they reach so the generator fails when a point
// stops reaching it.

import { spriteFreeFixtureNames } from "../headless/fixtures/index";
import { SnapshotPoint, UNIT_NAMES } from "./unitSnapshots";

// How many of each unit's first calls are recorded in each fixture
const FIRST_CALLS = 2;

// The phases of one cycle, each a call of _simulate
const PHASES = 16;

// The columns of the map one sweep of the map scan covers, an eighth each
const STRIPS = 8;

function firstCalls(): SnapshotPoint[] {
  return spriteFreeFixtureNames().flatMap((fixture) => UNIT_NAMES.flatMap((unit) => {
    // The map scan's first sweep, with no handlers and with each family that has tiles in the strip alone
    const calls = unit === "mapScanner.mapScan" ? STRIPS : FIRST_CALLS;
    return Array.from({length: calls}, (_, call): SnapshotPoint =>
      unit === "mapScanner.mapScan" ? {fixture, unit, call, handlers: "each"} : {fixture, unit, call});
  }));
}

export const SNAPSHOT_POINTS: SnapshotPoint[] = [
  ...firstCalls(),

  // simulation._simulate: the rest of the suburb's first cycle, so each phase is recorded once
  ...Array.from({length: PHASES - FIRST_CALLS}, (_, i): SnapshotPoint => ({fixture: "suburb", unit: "simulation._simulate",
                                                                          call: FIRST_CALLS + i})),

  // simulation._simulate: phase 0 on a cycle whose demand valves are not set, with the first evaluation done, which
  // runs nothing but the counters and the census clearing
  ...spriteFreeFixtureNames().map((fixture): SnapshotPoint => ({
    fixture, unit: "simulation._simulate", call: 0,
    where: (simulation) => simulation._phaseCycle === 0 && simulation._simCycle % 2 === 0 &&
                           !simulation._initialEvaluationPending,
    reaches: {branch: "phase 0 alone", test: (record) => record.reached.length === 0},
  })),
];
