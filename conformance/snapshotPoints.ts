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

// The calls the unit snapshots record (conformance/README.md): each unit's first calls in each sprite-free fixture not
// made for a branch, and the points a unit's rarer branches need, which name the branch they reach so the generator
// fails when a point stops reaching it.

import { fixtureNamesOf } from "../headless/fixtures/index";
import { SnapshotPoint, UNIT_NAMES } from "./unitSnapshots";

// How many of each unit's first calls are recorded in each fixture
const FIRST_CALLS = 2;

// The phases of one cycle, each a call of _simulate
const PHASES = 16;

// The columns of the map one sweep of the map scan covers, an eighth each
const STRIPS = 8;

// The scans of phases 11 to 15 and the cycles each runs on, every so many, at slow, medium and fast speed: the tables
// in simulation.js, which a point reaching a scan on another cycle than its table says fails the generator
const GATED_SCANS = [
  {phase: 11, unit: "powerManager.doPowerScan", every: [2, 4, 5]},
  {phase: 12, unit: "blockMapUtils.pollutionTerrainLandValueScan", every: [2, 7, 17]},
  {phase: 13, unit: "blockMapUtils.crimeScan", every: [1, 8, 18]},
  {phase: 14, unit: "blockMapUtils.populationDensityScan", every: [1, 9, 19]},
  {phase: 15, unit: "blockMapUtils.fireAnalysis", every: [1, 10, 20]},
];

// The suburb at each speed, by its index in GATED_SCANS's tables
const SPEED_FIXTURES = [{fixture: "suburbSlow", speed: 0}, {fixture: "suburb", speed: 1}, {fixture: "suburbFast", speed: 2}];

// The cycle count phase 0 advances to, which wraps after 1023
function nextSimCycle(simCycle: number): number {
  return simCycle + 1 > 1023 ? 0 : simCycle + 1;
}

// A branch a record reaches when the call reaches every one of the units and none of the others
function reaching(branch: string, units: string[], others: string[] = []): SnapshotPoint["reaches"] {
  return {branch, test: (record) => units.every((unit) => record.reached.includes(unit)) &&
                                    !others.some((unit) => record.reached.includes(unit))};
}

function firstCalls(): SnapshotPoint[] {
  return fixtureNamesOf("snapshots").flatMap((fixture) => UNIT_NAMES.flatMap((unit) => {
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
  ...fixtureNamesOf("snapshots").map((fixture): SnapshotPoint => ({
    fixture, unit: "simulation._simulate", call: 0,
    where: (simulation) => simulation._phaseCycle === 0 && simulation._simCycle % 2 === 0 &&
                           !simulation._initialEvaluationPending,
    reaches: {branch: "phase 0 alone", test: (record) => record.reached.length === 0},
  })),

  // simulation._simulate: phase 0 on a cycle that sets the demand valves, every second one, counted after the phase
  // advances the cycle
  {
    fixture: "suburb", unit: "simulation._simulate", call: 0,
    where: (simulation) => simulation._phaseCycle === 0 && nextSimCycle(simulation._simCycle) % 2 === 0,
    reaches: reaching("the valves set", ["valves.setValves"]),
  },

  // simulation._simulate: phase 9 when each of its counts falls due, on the city time phase 0 advanced: the census
  // every 4, the long census every 40, and the tax and the evaluation every 48
  ...[
    {when: (time: number) => time % 4 === 0 && time % 40 !== 0 && time % 48 !== 0,
     reaches: reaching("the census alone", ["census.take10Census"], ["census.take120Census", "budget.collectTax"])},
    {when: (time: number) => time % 40 === 0, reaches: reaching("the long census", ["census.take120Census"])},
    {when: (time: number) => time % 48 === 0,
     reaches: reaching("the tax and the evaluation", ["budget.collectTax", "evaluation.cityEvaluation"])},
  ].map(({when, reaches}): SnapshotPoint => ({
    fixture: "suburb", unit: "simulation._simulate", call: 0,
    where: (simulation) => simulation._phaseCycle === 9 && when(simulation._cityTime),
    reaches,
  })),

  // simulation._simulate: phase 10 on either side of its gate on the cycle count, which eases the rate of growth on
  // every fifth cycle
  ...[true, false].map((open): SnapshotPoint => ({
    fixture: "suburb", unit: "simulation._simulate", call: 0,
    where: (simulation) => simulation._phaseCycle === 10 && (simulation._simCycle % 5 === 0) === open,
    reaches: open ? reaching("the rate of growth eased", ["blockMapUtils.neutraliseRateOfGrowthMap"]) :
                    reaching("the rate of growth left", [], ["blockMapUtils.neutraliseRateOfGrowthMap"]),
  })),

  // simulation._simulate: phases 11 to 15 at each speed, on a cycle whose count opens the phase's scan and on one that
  // doesn't, where one does: a scan every cycle has no closed side
  ...SPEED_FIXTURES.flatMap(({fixture, speed}) => GATED_SCANS.flatMap(({phase, unit, every}) =>
    [true, false].filter((open) => open || every[speed] > 1).map((open): SnapshotPoint => ({
      fixture, unit: "simulation._simulate", call: 0,
      where: (simulation) => simulation._phaseCycle === phase && (simulation._simCycle % every[speed] === 0) === open,
      reaches: open ? reaching(`${unit} at ${fixture}'s speed`, [unit]) :
                      reaching(`${unit} held at ${fixture}'s speed`, [], [unit]),
    })))),
];
