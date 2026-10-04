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

// The calls the unit snapshots record (conformance/README.md): each unit's first calls in each fixture of the kind
// snapshots, and the points a unit's rarer branches need, which name the branch they reach so the generator fails when
// a point stops reaching it.

import { SaveData } from "../headless/city";
import { BRIDGE_STRIP, FIRE_STRIP, RADIATION_STRIP, STADIUM_STRIP } from "../headless/fixtures/disasters";
import { fixtureNamesOf } from "../headless/fixtures/index";
import { buildingAt, lineOf } from "../headless/fixtures/toolCommands";
import {
  BUDGET_REVIEW_DUE, CLASSIFICATION_UPDATED, COMMAND_RESULT, FIRE_STATION_NEEDS_FUNDING, FRONT_END_MESSAGE, HIGH_CRIME,
  NO_MONEY, NOT_ENOUGH_POWER, POLICE_NEEDS_FUNDING, POPULATION_UPDATED, REACHED_TOWN, ROAD_NEEDS_FUNDING,
} from "../src/messages";
import { Command, ToolName } from "../src/protocol";
import { savedState } from "../src/stateHash";
import { BIT_MASK, ZONEBIT } from "../src/tileFlags";
import { TileUtils } from "../src/tileUtils.js";
import {
  BRWH, DIRT, FIRE, FREEZ, FULLSTADIUM, HBRIDGE, HTRFBASE, LASTFIRE, LASTIND, LASTRUBBLE, LTRFBASE, PORTBASE,
  POWERBASE, RADTILE, RIVER, ROADBASE, RUBBLE, STADIUM, VBRIDGE,
} from "../src/tileValues";
import { local } from "./commandCases";
import { Internals } from "./instrumentation";
import {
  CommandPoint, SnapshotPoint, SnapshotRecord, stateAfter, stateBefore, UNIT_NAMES,
} from "./unitSnapshots";
import { zonePoint } from "./zoneBranches";

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

// The parts of a saved state the branches below are told by, beyond those the headless code reads
interface SavedState extends SaveData {
  simulation: SaveData["simulation"] & {lastPowerMessage: number | null};
  map: SaveData["map"] & {tiles: number[]};
  census: {landValueAverage: number, pollutionAverage: number};
  scannedState: {
    blockMaps: {crimeRateMap: number[], landValueMap: number[], policeStationMap: number[],
                populationDensityMap: number[], trafficDensityMap: number[]},
    power: {powerCapacity: number, powerLoad: number, powerStack: {x: number, y: number}[]},
  };
}

function before(record: SnapshotRecord): SavedState {
  return stateBefore<SavedState>(record);
}

function after(record: SnapshotRecord): SavedState {
  return stateAfter<SavedState>(record);
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

// A block of the land value scan, two tiles a side, with a developed tile among its four
function developedBlock(state: SavedState, blockX: number, blockY: number): boolean {
  const {width, tiles} = state.map;
  return [0, 1].some((dx) => [0, 1].some((dy) =>
    (tiles[(blockX * 2 + dx) + (blockY * 2 + dy) * width] & BIT_MASK) >= ROADBASE));
}

// A developed block whose crime is high enough to take from its value. The crime map's blocks are the land value
// scan's.
function crimeOnDevelopedLand(state: SavedState): boolean {
  const blocksWide = Math.ceil(state.map.width / 2);
  return state.scannedState.blockMaps.crimeRateMap.some((crime, i) =>
    crime > 190 && developedBlock(state, i % blocksWide, Math.floor(i / blocksWide)));
}

// The blocks of land with a value whose crime before the police passes the crime scan's cap of 300, by index in the
// land value map. The scan only reads the land value and population density maps.
function crimePastItsCap(state: SavedState): number[] {
  const {landValueMap, populationDensityMap} = state.scannedState.blockMaps;
  return landValueMap.flatMap((landValue, i) => (landValue > 0 && 128 - landValue + populationDensityMap[i] > 300 ?
    [i] : []));
}

// A block whose crime passes the cap of 300 and, less the police, still passes the most a block holds, 250: the crime
// scan's two upper limits. The police cover is the station map as the scan smoothed it, which the state after it holds.
function crimeAtItsCaps(state: SavedState): boolean {
  const policeStationMap = state.scannedState.blockMaps.policeStationMap;
  const blocksWide = Math.ceil(state.map.width / 2);
  const policeBlocksWide = Math.ceil(state.map.width / 8);

  return crimePastItsCap(state).some((i) => {
    const police = policeStationMap[Math.floor((i % blocksWide) / 4) +
                                    Math.floor(Math.floor(i / blocksWide) / 4) * policeBlocksWide];
    return 300 - police > 250;
  });
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

// --- The infrastructure handlers' rarer branches, each a map scan of one strip of the disasters fixture, whose scenes
// headless/fixtures/disasters.ts lays out a strip each

interface SavedTiles {
  map: {width: number, tiles: number[]};
}

// Whether a tile of the strip the record scanned went from a value `from` accepts to one `to` accepts
function tileChanged(record: SnapshotRecord, from: (value: number) => boolean, to: (value: number) => boolean): boolean {
  const before = (record.before as SavedTiles).map;
  const after = (record.after as SavedTiles).map.tiles;
  // A map scan's arguments are the columns of its strip
  const [x0, x1] = record.args as number[];

  return before.tiles.some((raw, i) => {
    const x = i % before.width;
    return x >= x0 && x < x1 && from(raw & BIT_MASK) && to(after[i] & BIT_MASK);
  });
}

const {isFire, isFlood, isManualExplosion, isRoad} = TileUtils;
const isRubble = (value: number) => value >= RUBBLE && value <= LASTRUBBLE;
const isBridge = (value: number) => value === HBRIDGE || value === VBRIDGE;
const is = (wanted: number) => (value: number) => value === wanted;

// A strip's map scan with each family alone, whose record of the family that owns the branch must reach it
function scanOf(strip: number, call: number, family: string, branch: string, test: (record: SnapshotRecord) => boolean,
                where?: (simulation: Internals) => boolean): SnapshotPoint {
  return {
    fixture: "disasters", unit: "mapScanner.mapScan", call, handlers: "each",
    where: (simulation, args) => args[0] === strip && (where === undefined || where(simulation)),
    reaches: {branch, test, family},
  };
}

const floodCount = (state: object) => (state as {disasters: {floodCount: number}}).disasters.floodCount;

// The fire department's effect, of the live budget or a saved one
const fireEffect = (budget: object) => (budget as {fireEffect: number}).fireEffect;

// A drawbridge opening turns two of its bridge tiles to water too, so a bridge worn to water is told apart by a scan in
// which no drawbridge opened
const drawbridgeOpened = (record: SnapshotRecord) => tileChanged(record, is(HBRIDGE), is(BRWH));

function infrastructurePoints(): SnapshotPoint[] {
  return [
    scanOf(FIRE_STRIP, 1, "miscTiles", "a fire burning out", (record) => tileChanged(record, isFire, isRubble)),
    scanOf(FIRE_STRIP, 0, "miscTiles", "an explosion cleared to rubble",
           (record) => tileChanged(record, isManualExplosion, isRubble)),
    scanOf(FIRE_STRIP, 1, "miscTiles", "a fire spreading into a zone's centre",
           (record) => tileChanged(record, is(FREEZ), isFire)),
    scanOf(FIRE_STRIP, 0, "emergencyServices", "a fire station working at a share of its effect",
           (record) => fireEffect((record.before as {budget: object}).budget) < 1000 &&
                       record.reached.includes("emergencyServices.fireStationFound"),
           (simulation) => fireEffect(simulation.budget) < 1000),
    scanOf(BRIDGE_STRIP, 3, "road", "a drawbridge opening", drawbridgeOpened),
    scanOf(BRIDGE_STRIP, 1, "road", "a drawbridge closing", (record) => tileChanged(record, is(BRWH), is(HBRIDGE))),
    scanOf(BRIDGE_STRIP, 129, "road", "a road wearing away", (record) => tileChanged(record, isRoad, isRubble)),
    scanOf(BRIDGE_STRIP, 68, "road", "a bridge wearing away to water",
           (record) => tileChanged(record, isBridge, is(RIVER)) && !drawbridgeOpened(record)),
    scanOf(STADIUM_STRIP, 17, "stadia", "a stadium's game starting",
           (record) => tileChanged(record, is(STADIUM), is(FULLSTADIUM))),
    scanOf(STADIUM_STRIP, 25, "stadia", "a stadium's game ending",
           (record) => tileChanged(record, is(FULLSTADIUM), is(STADIUM))),
    scanOf(RADIATION_STRIP, 1, "miscTiles", "radiation decaying", (record) => tileChanged(record, is(RADTILE), is(DIRT))),
    scanOf(RADIATION_STRIP, 0, "miscTiles", "a flood spreading into a zone's centre",
           (record) => tileChanged(record, is(FREEZ), isFlood)),
    scanOf(RADIATION_STRIP, 30, "miscTiles", "a flood receding", (record) => tileChanged(record, isFlood, is(DIRT))),
    {
      fixture: "disasters", unit: "disasterManager.doDisasters", call: 0,
      reaches: {branch: "a flood counting down", test: (record) => floodCount(record.after) < floodCount(record.before)},
    },
  ];
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

  // blockMapUtils.crimeScan: crime past its cap of 300, and past the most a block holds even less the police
  {
    fixture: "suburbBroke", unit: "blockMapUtils.crimeScan", call: 0,
    where: (simulation) => crimePastItsCap(savedState(simulation) as SavedState).length > 0,
    reaches: {branch: "crime at its caps", test: (record) => crimeAtItsCaps(after(record))},
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

  ...infrastructurePoints(),

  ...cityRulesPoints(),

  // mapScanner.mapScan: every branch of the zone handlers and their drives, several in one call where a call reaches
  // them together, since each point records the whole city, in the calls whose points record the fewest families
  zonePoint("suburb", "industrial", ["an empty industrial zone left as it is when it declines",
                                     "an unpowered industrial zone assessed"]),

  zonePoint("suburbBroke", "residential", ["a drive arriving to its east"]),
  zonePoint("suburbBroke", "residential", [
    "a block grown", "a drive giving up at a dead end", "a drive with no route", "a house removed",
    "a residential zone with no road declined",
  ]),

  zonePoint("suburbUnderfunded", "industrial", ["an industrial zone declined from the second level or above"]),

  zonePoint("hospitalTown", "commercial", ["an empty commercial zone left as it is when it declines"]),
  zonePoint("hospitalTown", "residential", ["a house built on a lot that won a tie", "houses built into a block"]),
  zonePoint("hospitalTown", "commercial", ["a commercial zone declined from the second level or above"]),
  zonePoint("hospitalTown", "industrial", ["an industrial zone grown", "traffic at its cap"]),
  zonePoint("hospitalTown", "residential", ["the sparsest block declined to houses"]),
  zonePoint("hospitalTown", "commercial", ["a commercial zone grown", "commercial growth held back by land value"]),
  zonePoint("hospitalTown", "residential", ["a hospital built"]),
  zonePoint("hospitalTown", "residential", ["a hospital emptied"]),
  zonePoint("hospitalTown", "residential", ["a block declined to a sparser block", "a drive arriving to its west"]),

  zonePoint("roadlessTown", "industrial", ["an industrial zone emptied", "an industrial zone with no road declined"]),
  zonePoint("roadlessTown", "commercial", ["a commercial zone emptied", "a commercial zone with no road declined"]),
  zonePoint("roadlessTown", "residential", [
    "a drive backing up from a dead end, then going its whole distance without arriving",
  ]),

  zonePoint("smokyWoods", "residential", ["residential growth held back by pollution"]),
];

// --- The city-level rules' rarer branches: the census, the valves, the year end, the evaluation and the advisor

// The census's ramps and the averages they move toward, as the city holds them and as a save holds them
interface Ramps {
  crimeAverage: number;
  crimeRamp: number;
  pollutionAverage: number;
  pollutionRamp: number;
}

// The parts of a saved state the city-level rules' branches are told by
interface CityRulesState extends SaveData {
  census: Ramps & {resPop: number, comPop: number, indPop: number};
  evaluation: {cityPopDelta: number};
}

function eventNames(record: SnapshotRecord): string[] {
  return record.events.map((event) => event.name);
}

// The subjects of the record's front-end messages
function subjects(record: SnapshotRecord): string[] {
  return record.events.filter((event) => event.name === FRONT_END_MESSAGE)
    .map((event) => (event.payload as {subject: string}).subject);
}

// A ramp falling by other than a multiple of 4, where the census's quarter step truncates rather than floors
function rampFallsByAFraction(census: Ramps): boolean {
  const fallsByAFraction = (average: number, ramp: number) => average < ramp && (ramp - average) % 4 !== 0;
  return fallsByAFraction(census.crimeAverage, census.crimeRamp) ||
         fallsByAFraction(census.pollutionAverage, census.pollutionRamp);
}

// A unit's call at a city time, in a fixture whose city reaches the branch there
function atCityTime(fixture: string, unit: SnapshotPoint["unit"], cityTime: number,
                    reaches: SnapshotPoint["reaches"]): SnapshotPoint {
  return {fixture, unit, call: 0, where: (simulation) => simulation._cityTime === cityTime, reaches};
}

// The advisor's check at a city time, which sends the subject, or nothing for null
function adviceAt(fixture: string, cityTime: number, subject: string | null): SnapshotPoint {
  return atCityTime(fixture, "simulation._sendMessages", cityTime, subject === null
    ? {branch: "a check that sends nothing", test: (record) => subjects(record).length === 0}
    : {branch: subject, test: (record) => subjects(record).includes(subject)});
}

function cityRulesPoints(): SnapshotPoint[] {
  return [
    {fixture: "suburb", unit: "census.take10Census", call: 0,
     where: (simulation) => rampFallsByAFraction(simulation._census),
     reaches: {branch: "a ramp falling by a fraction",
               test: (record) => rampFallsByAFraction(stateBefore<CityRulesState>(record).census)}},

    // A grown town's demand, worked out in float
    atCityTime("suburb", "valves.setValves", 144, {
      branch: "a town of every zone type",
      test: (record) => {
        const {resPop, comPop, indPop} = stateBefore<CityRulesState>(record).census;
        return resPop > 0 && comPop > 0 && indPop > 0;
      },
    }),

    // The year end: auto-budget off, and auto-budget that can't pay and turns itself off
    {fixture: "suburbUnderfunded", unit: "budget.collectTax", call: 0,
     reaches: {branch: "a review with auto-budget off",
               test: (record) => eventNames(record).includes(BUDGET_REVIEW_DUE)}},
    {fixture: "suburbBroke", unit: "budget.collectTax", call: 0,
     reaches: {branch: "a shortfall", test: (record) => subjects(record).includes(NO_MONEY)}},

    // The evaluation of a village become a town, and of a shrinking town
    atCityTime("suburb", "evaluation.cityEvaluation", 144, {
      branch: "a new class", test: (record) => eventNames(record).includes(CLASSIFICATION_UPDATED),
    }),
    atCityTime("suburbFast", "evaluation.cityEvaluation", 336, {
      branch: "a shrinking population",
      test: (record) => stateAfter<CityRulesState>(record).evaluation.cityPopDelta < 0,
    }),

    // The growth check, with and without a new class, and the advisor's conditions the fixtures reach
    atCityTime("suburb", "simulation._sendMessages", 12, {
      branch: "a new population", test: (record) => eventNames(record).includes(POPULATION_UPDATED),
    }),
    atCityTime("suburb", "simulation._sendMessages", 32, {
      branch: "a growth check of an unchanged population, and no blackouts",
      test: (record) => record.events.length === 0,
    }),
    adviceAt("suburb", 136, REACHED_TOWN),
    adviceAt("suburb", 26, null),
    adviceAt("suburbBroke", 118, ROAD_NEEDS_FUNDING),
    adviceAt("suburbBroke", 185, FIRE_STATION_NEEDS_FUNDING),
    adviceAt("suburbBroke", 188, POLICE_NEEDS_FUNDING),
    adviceAt("suburbBroke", 298, HIGH_CRIME),

    // The status of a city whose roads lack funding
    {fixture: "suburbBroke", unit: "simulation._publishCityStatus", call: 0,
     where: (simulation) => simulation.budget.roadEffect < 20,
     reaches: {branch: "a funding condition", test: (record) => record.events.some((event) =>
       (event.payload as {conditions?: string[]} | undefined)?.conditions?.includes(ROAD_NEEDS_FUNDING))}},
  ];
}

// --- Command applications: each tool's rules and costs, and the settings commands, applied to a fixture's city

// A line of the tool, with or without auto-bulldoze
function line(tool: ToolName, x1: number, y1: number, x2: number, y2: number, autoBulldoze: boolean): Command {
  return {...lineOf(tool, x1, y1, x2, y2), autoBulldoze};
}

function at(tool: ToolName, x: number, y: number, autoBulldoze: boolean): Command {
  return {...buildingAt(tool, x, y), autoBulldoze};
}

// The outcomes and events a record's commands came to
function outcomes(record: SnapshotRecord): string[] {
  return record.events.filter((event) => event.name === COMMAND_RESULT)
    .map((event) => (event.payload as {outcome: string}).outcome);
}

function reachingOutcomes(branch: string, wanted: string[]): CommandPoint["reaches"] {
  return {branch, test: (record) => wanted.every((outcome) => outcomes(record).includes(outcome))};
}

// The step the suburb has passed its first year end by, so its services' upkeep is set and its grid powered
const AFTER_FIRST_YEAR = 2400;

export const COMMAND_POINTS: CommandPoint[] = [
  // Roads: across the river, dozing its edges and bridging it; over a power line; and refused on a zone and on trees
  // without auto-bulldoze, then laid over the trees with it, joining a road's end
  {
    fixture: "suburb", step: 0,
    received: local(
      line("road", 76, 20, 90, 20, true), at("road", 44, 13, false), at("road", 34, 16, true),
      at("road", 45, 19, false), at("road", 45, 19, true), line("road", 78, 21, 79, 21, false),
    ),
    reaches: reachingOutcomes("a bridge, a crossing and refusals", ["ok", "failed"]),
  },

  // Rail: a tunnel under the river, a crossing over a road and a power line, and track joining the crossing
  {
    fixture: "suburb", step: 0,
    received: local(
      line("rail", 72, 22, 90, 22, true), at("rail", 35, 19, false), at("rail", 35, 20, false),
      at("rail", 44, 13, false), at("rail", 34, 16, false),
    ),
    reaches: reachingOutcomes("a tunnel, crossings and a refusal", ["ok", "failed"]),
  },

  // Wire on a powered grid: a line under the river, over a road, and onto a zone it can't cross
  {
    fixture: "suburb", step: AFTER_FIRST_YEAR,
    received: local(
      line("wire", 70, 26, 97, 26, true), at("wire", 30, 15, false), at("wire", 30, 16, false),
      line("wire", 44, 20, 44, 22, false),
    ),
    reaches: reachingOutcomes("a line under water and over a road, and a refusal", ["ok", "failed"]),
  },

  // Every building, with funds granted for them, a wire whose end a new zone turns into, a zone on trees with and
  // without auto-bulldoze, and one off the map's edge
  {
    fixture: "suburb", step: 0,
    received: local(
      {type: "addFunds"}, {type: "addFunds"},
      at("residential", 33, 21, false), at("commercial", 36, 21, false), at("industrial", 39, 21, false),
      at("police", 42, 21, false), at("fire", 45, 21, false), at("stadium", 32, 24, false), at("coal", 36, 24, false),
      at("nuclear", 40, 24, false), at("port", 44, 24, false), at("airport", 55, 44, false),
      line("wire", 47, 22, 50, 22, false), at("industrial", 49, 24, false),
      at("residential", 66, 23, false), at("residential", 66, 23, true), at("police", 0, 50, true),
    ),
    reaches: reachingOutcomes("buildings, refusals and the bulldozer they need", ["ok", "needsBulldoze", "failed"]),
  },

  // The bulldozer: a zone from its centre, a power plant from another of its tiles, an airport built for it, a road,
  // trees, a river edge, a bridge, and the river itself, which it can't doze
  {
    fixture: "suburb", step: 0,
    received: local(
      at("bulldozer", 15, 13, false), at("bulldozer", 12, 13, false),
      at("airport", 55, 44, false), at("bulldozer", 57, 46, false),
      at("bulldozer", 34, 15, false), at("bulldozer", 52, 8, false), at("bulldozer", 78, 20, false),
      line("road", 77, 20, 80, 20, true), at("bulldozer", 79, 20, false), at("bulldozer", 82, 20, false),
    ),
    reaches: reachingOutcomes("zones blown up and tiles dozed, and water it can't doze", ["ok", "failed"]),
  },

  // Parks, each drawing what to plant, and one on trees, which draws and plants nothing
  {
    fixture: "suburb", step: 0,
    received: local(line("park", 60, 40, 66, 40, false), at("park", 52, 8, false)),
    reaches: reachingOutcomes("parks planted and refused", ["ok", "needsBulldoze"]),
  },

  // Spending the last of the funds: an airport it can't pay for, then roads, a wire and dozing trees down to nothing,
  // which says there is no money, and a road it can't pay for
  {
    fixture: "suburbBroke", step: 0,
    received: local(
      at("airport", 55, 40, false), line("road", 52, 31, 68, 31, false), at("wire", 52, 32, false),
      at("bulldozer", 60, 30, false), at("bulldozer", 61, 30, false), at("bulldozer", 60, 29, false),
      at("road", 69, 31, false),
    ),
    reaches: {
      branch: "funds spent to nothing, and tools refused for want of them",
      test: (record) => outcomes(record).includes("noMoney") && record.events.some((event) =>
        event.name === FRONT_END_MESSAGE && (event.payload as {subject: string}).subject === NO_MONEY),
    },
  },

  // The settings: funding some services and leaving the others, the tax, the speed, auto-budget, disasters and a grant,
  // with commands rejected among them
  {
    fixture: "suburb", step: AFTER_FIRST_YEAR,
    received: [
      ...local(
        {type: "setBudget", road: 50, police: 0, tax: 12}, {type: "setBudget", tax: 5},
        {type: "setBudget", fire: 75, tax: 5}, {type: "setSpeed", speed: 3}, {type: "setSpeed", speed: 3},
        {type: "setSpeed", speed: 0}, {type: "setAutoBudget", on: false}, {type: "setDisasters", on: true},
        {type: "addFunds"},
      ),
      {player: "ada", command: {type: "triggerDisaster", kind: "volcano"}},
      {player: "ada", command: {type: "tool", tool: "road", path: [{x: 120, y: 0}], autoBulldoze: true}},
    ],
    reaches: reachingOutcomes("settings applied and commands rejected", ["ok", "rejected"]),
  },
];
