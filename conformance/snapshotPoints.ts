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
import { FRONT_END_MESSAGE, NOT_ENOUGH_POWER } from "../src/messages";
import { savedState } from "../src/stateHash";
import { BIT_MASK, ZONEBIT } from "../src/tileFlags";
import { FIRE, HTRFBASE, LASTFIRE, LASTIND, LTRFBASE, PORTBASE, POWERBASE } from "../src/tileValues";
import { SnapshotPoint, SnapshotRecord, UNIT_NAMES } from "./unitSnapshots";

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

// The parts of a saved state the branches below are told by
interface SavedState {
  simulation: {randomState: number[], lastPowerMessage: number | null};
  map: {tiles: number[]};
  census: {landValueAverage: number, pollutionAverage: number};
  scannedState: {
    blockMaps: {crimeRateMap: number[], landValueMap: number[], trafficDensityMap: number[]},
    power: {powerCapacity: number, powerLoad: number, powerStack: {x: number, y: number}[]},
  };
}

function before(record: SnapshotRecord): SavedState {
  return record.before as SavedState;
}

function after(record: SnapshotRecord): SavedState {
  return record.after as SavedState;
}

// A branch the state a call starts from decides: the point takes the first call whose city is in that state, and a
// record it makes must start from it
function startingFrom(branch: string, test: (state: SavedState) => boolean): Pick<SnapshotPoint, "where" | "reaches"> {
  return {
    where: (simulation) => test(savedState(simulation) as SavedState),
    reaches: {branch, test: (record) => test(before(record))},
  };
}

function shortage(record: SnapshotRecord): boolean {
  const power = after(record).scannedState.power;
  return power.powerLoad > power.powerCapacity;
}

function hasTile(state: SavedState, test: (value: number) => boolean): boolean {
  return state.map.tiles.some((tile) => test(tile & BIT_MASK));
}

// The tiles of each pollution score but the coal plant's, which every town has: light and heavy traffic, and industry
function trafficAndIndustry(state: SavedState): boolean {
  return hasTile(state, (value) => value >= LTRFBASE && value < HTRFBASE) &&
         hasTile(state, (value) => value >= HTRFBASE && value < POWERBASE) &&
         hasTile(state, (value) => value > LASTIND && value < PORTBASE);
}

// A block valued as developed by the last scan whose crime is high enough to take from its value. The crime and land
// value maps have the same blocks.
function crimeOnDevelopedLand(state: SavedState): boolean {
  const {crimeRateMap, landValueMap} = state.scannedState.blockMaps;
  return crimeRateMap.some((crime, i) => crime > 190 && landValueMap[i] > 0);
}

// Traffic in each of the bands that ease differently: light traffic, which clears, moderate, and heavy, above 200
function trafficInEveryBand(state: SavedState): boolean {
  const traffic = state.scannedState.blockMaps.trafficDensityMap;
  return traffic.some((density) => density > 0 && density <= 24) &&
         traffic.some((density) => density > 24 && density <= 200) &&
         traffic.some((density) => density > 200);
}

// Two power sources stacked whose plants touch side by side: plants are four tiles a side, centred one in from the top
// left, so their centres are four apart in a row or a column
function plantsSideBySide(state: SavedState): boolean {
  const stack = state.scannedState.power.powerStack;
  return stack.some((a) => stack.some((b) =>
    (a.y === b.y && Math.abs(a.x - b.x) === 4) || (a.x === b.x && Math.abs(a.y - b.y) === 4)));
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

  // powerManager.doPowerScan: a shortage, whose message the throttle sends at the first scan and holds at the next,
  // within three city years of it
  {
    fixture: "overloaded", unit: "powerManager.doPowerScan", call: 0,
    reaches: {branch: "a shortage sent", test: (record) => shortage(record) && record.events.some((event) =>
      event.name === FRONT_END_MESSAGE && (event.payload as {subject: string}).subject === NOT_ENOUGH_POWER)},
  },
  {
    fixture: "overloaded", unit: "powerManager.doPowerScan", call: 1,
    reaches: {branch: "a shortage held by the throttle",
              test: (record) => shortage(record) && before(record).simulation.lastPowerMessage !== null &&
                                record.events.length === 0},
  },

  // blockMapUtils.pollutionTerrainLandValueScan: two blocks as polluted as the most polluted so far, whose tie draws
  // from the stream
  {
    fixture: "suburb", unit: "blockMapUtils.pollutionTerrainLandValueScan", call: 0,
    reaches: {branch: "a pollution tie", test: (record) =>
      before(record).simulation.randomState.join() !== after(record).simulation.randomState.join()},
  },

  // blockMapUtils.pollutionTerrainLandValueScan: the scores of traffic and industry, and the value crime takes from
  // developed land, which a town meets once it has grown
  {
    fixture: "suburbBroke", unit: "blockMapUtils.pollutionTerrainLandValueScan", call: 0,
    ...startingFrom("traffic, industry and crime on developed land",
                    (state) => trafficAndIndustry(state) && crimeOnDevelopedLand(state)),
  },

  // blockMapUtils.neutraliseTrafficMap: traffic easing in each band
  {
    fixture: "suburbBroke", unit: "blockMapUtils.neutraliseTrafficMap", call: 0,
    ...startingFrom("traffic in every band", trafficInEveryBand),
  },

  // blockMapUtils.pollutionTerrainLandValueScan: burning tiles, and a tile of FIRE itself, which scores as radiation
  // does, since the burning tiles' score starts above it
  {
    fixture: "forestFire", unit: "blockMapUtils.pollutionTerrainLandValueScan", call: 0,
    ...startingFrom("fire, and a tile in the band of radiation",
                    (state) => hasTile(state, (value) => value === FIRE) &&
                               hasTile(state, (value) => value > FIRE && value <= LASTFIRE)),
  },

  // powerManager.doPowerScan: a plant stacked as a source that the walk from the plant beside it has already reached
  {
    fixture: "twinPlants", unit: "powerManager.doPowerScan", call: 0,
    ...startingFrom("two plants side by side", plantsSideBySide),
  },

  // A city of no developed tile and no zone: a power scan with no plant, the scans' averages over no block, and the
  // city centre with no zone to place it by
  {
    fixture: "wilderness", unit: "powerManager.doPowerScan", call: 0,
    reaches: {branch: "no power source",
              test: (record) => before(record).scannedState.power.powerStack.length === 0 &&
                                after(record).scannedState.power.powerCapacity === 0},
  },
  {
    fixture: "wilderness", unit: "blockMapUtils.pollutionTerrainLandValueScan", call: 0,
    reaches: {branch: "no developed tile and no pollution",
              test: (record) => after(record).census.landValueAverage === 0 &&
                                after(record).census.pollutionAverage === 0},
  },
  {
    fixture: "wilderness", unit: "blockMapUtils.crimeScan", call: 0,
    reaches: {branch: "no land with a value",
              test: (record) => before(record).scannedState.blockMaps.landValueMap.every((value) => value === 0)},
  },
  {
    fixture: "wilderness", unit: "blockMapUtils.populationDensityScan", call: 0,
    reaches: {branch: "no zone", test: (record) => before(record).map.tiles.every((tile) => (tile & ZONEBIT) === 0)},
  },
];
