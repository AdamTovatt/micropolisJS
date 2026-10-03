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

// The zone families' branches, which the snapshot points for them name (snapshotPoints.ts). A branch is told from a
// trace of one call of the map scan, run on a copy of the city with one family's handlers alone, as the family's record
// of the call runs: the map and the traffic before the call and after it, and for each zone a handler visited, what the
// handler did, in order: its draws from the stream, its calls of ZoneUtils, and how its drive went. The copy is loaded
// from the city's save as the call finds it, and draws from its own copy of the stream, so the city's own run is
// untouched. A record's trace is run the same way, from the record's state before the call.

import { cityFromSave, SaveData } from "../headless/city";
import { Commercial } from "../src/commercial.js";
import { Industrial } from "../src/industrial.js";
import { Residential } from "../src/residential.js";
import { savedState } from "../src/stateHash";
import { BIT_MASK, POWERBIT } from "../src/tileFlags";
import { TileUtils } from "../src/tileUtils.js";
import { Traffic } from "../src/traffic.js";
import { FREEZ, HHTHR, HOSPITAL, LHTHR } from "../src/tileValues";
import { ZoneUtils } from "../src/zoneUtils.js";
import { Internals, registerFamilies, replaceMethod, SnapshotPoint, SnapshotRecord, unrecorded } from "./unitSnapshots";

export type ZoneFamily = "residential" | "commercial" | "industrial";

// What a drive came to, and the traffic it adds, which Traffic defines as properties its type leaves out
const Results = Traffic as unknown as {NO_ROAD_FOUND: number, NO_ROUTE_FOUND: number, MAX_TRAFFIC_DENSITY: number,
                                       TRIP_TRAFFIC: number};

// --- Traces

type Side = "north" | "east" | "south" | "west";

// The block maps whose reads are noted, which tell growZone from degradeZone: each module's growZone reads one of them
// after working out the land value and pollution, and its degradeZone reads neither
const BLOCK_MAP_READS = {landValue: "landValueMap", pollution: "pollutionDensityMap"};

type BlockMapRead = keyof typeof BLOCK_MAP_READS;

// Something a zone's handler did
type ZoneEvent =
  | {kind: "draw", method: string, result: unknown}
  | {kind: "zoneUtils", method: string}
  // A read of the land value or the pollution by the handler itself, not by ZoneUtils for it
  | {kind: "read", map: BlockMapRead}
  | {kind: "drive", result: number}
  // The drive found no way on: it backs up when it has a position to forget, and gives up when it has none
  | {kind: "deadEnd", backingUp: boolean}
  | {kind: "arrived", side: Side};

// A map as a save holds its tiles, read as the zone modules read a map
function savedMap({width, height, tiles}: {width: number, height: number, tiles: number[]}) {
  const getRawValue = (x: number, y: number) => tiles[y * width + x];
  const getTileValue = (x: number, y: number) => getRawValue(x, y) & BIT_MASK;
  return {
    width,
    height,
    testBounds: (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height,
    getRawValue,
    getTileValue,
    getTile: (x: number, y: number) => ({getRawValue: () => getRawValue(x, y), getValue: () => getTileValue(x, y)}),
  };
}

type SavedMap = ReturnType<typeof savedMap>;

// A zone a handler visited: its centre's tile value and population before the call and after it, where its module
// counts one, and what the handler did
interface ZoneVisit {
  x: number;
  y: number;
  before: number;
  after: number;
  populationBefore: number | null;
  populationAfter: number | null;
  powered: boolean;
  landValue: number;
  pollution: number;
  events: ZoneEvent[];
}

interface Trace {
  visits: ZoneVisit[];
  mapBefore: SavedMap;
  mapAfter: SavedMap;
  trafficBefore: number[];
  trafficAfter: number[];
}

// The visits of the run being traced, each with what its handler has done so far
let tracing: {x: number, y: number, events: ZoneEvent[]}[] | null = null;

function note(event: ZoneEvent): void {
  tracing?.[tracing.length - 1]?.events.push(event);
}

// The stream's draws, which call one another: only the one the handler made is noted
const DRAWS = ["getRandom", "getRandom16", "getRandom16Signed", "getChance", "getERandom"];

// What the handlers call that a branch reads
const ZONE_UTILS = ["getLandPollutionValue", "incRateOfGrowth", "putZone"];

// The sides of a drive's position, in the order driveDone looks at them
const SIDES: {side: Side, dx: number, dy: number}[] = [
  {side: "north", dx: 0, dy: -1}, {side: "east", dx: 1, dy: 0}, {side: "south", dx: 0, dy: 1}, {side: "west", dx: -1, dy: 0},
];

// Notes what the copy's handlers draw, call of ZoneUtils and drive, for the length of a run; gives what undoes it
function instrument(copy: Internals): (() => void)[] {
  let depth = 0;
  const draws = DRAWS.map((method) => replaceMethod(copy.random as object, method, (original) =>
    function(this: unknown, ...args: unknown[]) {
      depth++;
      try {
        const result = original.apply(this, args);
        if (depth === 1) {
          note({kind: "draw", method, result});
        }
        return result;
      } finally {
        depth--;
      }
    }));

  let inZoneUtils = 0;
  const zoneUtils = ZONE_UTILS.map((method) => replaceMethod(ZoneUtils, method, (original) =>
    function(this: unknown, ...args: unknown[]) {
      note({kind: "zoneUtils", method});
      inZoneUtils++;
      try {
        return original.apply(this, args);
      } finally {
        inZoneUtils--;
      }
    }));

  const reads = (Object.keys(BLOCK_MAP_READS) as BlockMapRead[]).map((map) =>
    replaceMethod(copy.blockMaps[BLOCK_MAP_READS[map]], "worldGet", (original) =>
      function(this: unknown, ...args: unknown[]) {
        if (inZoneUtils === 0) {
          note({kind: "read", map});
        }
        return original.apply(this, args);
      }));

  const traffic = copy._traffic;
  const drive = [
    replaceMethod(traffic, "makeTraffic", (original) => function(this: unknown, ...args: unknown[]) {
      const result = original.apply(this, args) as number;
      note({kind: "drive", result});
      return result;
    }),
    replaceMethod(traffic, "tryGo", (original) => function(this: unknown, ...args: unknown[]) {
      const result = original.apply(this, args);
      if (result === undefined) {
        note({kind: "deadEnd", backingUp: traffic._stack.length > 0});
      }
      return result;
    }),
    replaceMethod(traffic, "driveDone", (original) => function(this: unknown, ...args: unknown[]) {
      const result = original.apply(this, args);
      if (result) {
        const pos = args[0] as {x: number, y: number};
        const destination = args[1] as {low: number, high: number};
        const arrived = SIDES.find(({dx, dy}) => copy._map.testBounds(pos.x + dx, pos.y + dy) &&
          copy._map.getTileValue(pos.x + dx, pos.y + dy) >= destination.low &&
          copy._map.getTileValue(pos.x + dx, pos.y + dy) <= destination.high)!;
        note({kind: "arrived", side: arrived.side});
      }
      return result;
    }),
  ];

  return [...draws, ...zoneUtils, ...reads, ...drive];
}

// A zone's population as its module counts it, or null for a centre of another kind
function population(map: SavedMap, x: number, y: number, value: number): number | null {
  if (TileUtils.isResidential(value)) {
    return Residential.getZonePopulation(map, x, y, value);
  }

  if (TileUtils.isCommercial(value)) {
    return Commercial.getZonePopulation(map, x, y, value);
  }

  if (TileUtils.isIndustrial(value)) {
    return Industrial.getZonePopulation(map, x, y, value);
  }

  return null;
}

function mapOf(city: Internals): SavedMap {
  const saveData: {map?: {width: number, height: number, tiles: number[]}} = {};
  city._map.save(saveData);
  return savedMap(saveData.map!);
}

// For each family, a city with its handlers alone, each noting the zone it visits, which a call is copied into:
// Simulation.load restores the whole city, and nothing of the city it replaces survives
const copies = new Map<ZoneFamily, Internals>();

function copyFor(family: ZoneFamily, save: object): Internals {
  let copy = copies.get(family);
  if (copy === undefined) {
    copy = cityFromSave(structuredClone(save) as SaveData) as unknown as Internals;
    registerFamilies(copy, [family], false);
    copy._mapScanner._actions = copy._mapScanner._actions.map(({criterion, action}) => ({
      criterion,
      action: (...args: unknown[]) => {
        tracing?.push({x: args[1] as number, y: args[2] as number, events: []});
        return action(...args);
      },
    }));
    copies.set(family, copy);
  }

  return copy;
}

// The call with the family's handlers alone, run from the save, traced
function traceOf(family: ZoneFamily, save: object, args: number[]): Trace {
  const copy = copyFor(family, save);
  // A clone, so the copy shares no array with the save
  copy.load(structuredClone(save));
  const mapBefore = mapOf(copy);
  const trafficBefore = copy.blockMaps.trafficDensityMap.save();

  const visited: {x: number, y: number, events: ZoneEvent[]}[] = [];
  tracing = visited;
  const restores = instrument(copy);
  try {
    copy._mapScanner.mapScan(args[0], args[1], copy._constructSimData());
  } finally {
    restores.forEach((restore) => restore());
    tracing = null;
  }

  // The scan changes neither the land value nor the pollution
  const {landValueMap, pollutionDensityMap} = copy.blockMaps;
  const mapAfter = mapOf(copy);
  return {
    visits: visited.map(({x, y, events}) => {
      const before = mapBefore.getTileValue(x, y);
      const after = mapAfter.getTileValue(x, y);
      return {x, y, before, after, populationBefore: population(mapBefore, x, y, before),
              populationAfter: population(mapAfter, x, y, after), powered: (mapBefore.getRawValue(x, y) & POWERBIT) !== 0,
              landValue: landValueMap.worldGet(x, y), pollution: pollutionDensityMap.worldGet(x, y), events};
    }),
    mapBefore,
    mapAfter,
    trafficBefore,
    trafficAfter: copy.blockMaps.trafficDensityMap.save(),
  };
}

// The last call traced, and each family's trace of it, so the points looking at one call share its runs
let lastCall: {simulation: Internals, key: string, save: object, traces: Map<ZoneFamily, Trace>} | null = null;

function traceOfCall(simulation: Internals, args: number[], family: ZoneFamily): Trace {
  const key = [simulation._speedCycle, simulation._simCycle, simulation._phaseCycle, ...args].join(",");
  if (lastCall === null || lastCall.simulation !== simulation || lastCall.key !== key) {
    lastCall = {simulation, key, save: savedState(simulation), traces: new Map()};
  }

  let trace = lastCall.traces.get(family);
  if (trace === undefined) {
    trace = traceOf(family, lastCall.save, args);
    lastCall.traces.set(family, trace);
  }

  return trace;
}

// --- Branches

type Branch = (trace: Trace) => boolean;

// A branch some zone a handler visited reaches
const visited = (test: (visit: ZoneVisit, trace: Trace) => boolean): Branch => (trace) =>
  trace.visits.some((visit) => test(visit, trace));

const grew = (visit: ZoneVisit) =>
  visit.populationBefore !== null && visit.populationAfter !== null && visit.populationAfter > visit.populationBefore;

const declined = (visit: ZoneVisit) =>
  visit.populationBefore !== null && visit.populationAfter !== null && visit.populationAfter < visit.populationBefore;

const draws = (visit: ZoneVisit, method: string) =>
  visit.events.filter((event) => event.kind === "draw" && event.method === method);

const called = (visit: ZoneVisit, method: string) =>
  visit.events.some((event) => event.kind === "zoneUtils" && event.method === method);

const droveTo = (visit: ZoneVisit, result: number) =>
  visit.events.some((event) => event.kind === "drive" && event.result === result);

const deadEnd = (visit: ZoneVisit, backingUp: boolean) =>
  visit.events.some((event) => event.kind === "deadEnd" && event.backingUp === backingUp);

const arrived = (visit: ZoneVisit, side: Side) =>
  visit.events.some((event) => event.kind === "arrived" && event.side === side);

// A zone of the kind, and still one after the call
const stays = (isKind: (value: number) => boolean, visit: ZoneVisit) => isKind(visit.before) && isKind(visit.after);

// The zone passed its test for growth, or its test for decline: either works out the land value and pollution, and
// then growZone reads the map given while degradeZone reads neither. Which test drew the stream tells them apart less
// well, since a score that rules growth out draws nothing for it.
const workedOut = (visit: ZoneVisit) =>
  visit.events.findIndex((event) => event.kind === "zoneUtils" && event.method === "getLandPollutionValue");

const growthPassed = (visit: ZoneVisit, reads: BlockMapRead) => {
  const at = workedOut(visit);
  return at >= 0 && visit.events.slice(at).some((event) => event.kind === "read" && event.map === reads);
};

const declinePassed = (visit: ZoneVisit, growthReads: BlockMapRead) =>
  workedOut(visit) >= 0 && !growthPassed(visit, growthReads);

const isBlock = (value: number) => TileUtils.isResidential(value) && value !== FREEZ;
const isHouse = (value: number) => value >= LHTHR && value <= HHTHR;

// A house built on a lot that is not the first of the best scoring: a tie decided by a draw
const builtOnATie = visited((visit, {mapBefore, mapAfter}) => {
  if (visit.before !== FREEZ || visit.after !== FREEZ) {
    return false;
  }

  // The lots in the order buildHouse scans them, after the centre at index 0
  const lots = Residential.LOT_X_DELTA.slice(1).map((dx, i) =>
    ({x: visit.x + dx, y: visit.y + Residential.LOT_Y_DELTA[i + 1]}));
  const scores = lots.map(({x, y}) => (mapBefore.testBounds(x, y) ? Residential.evalLot(mapBefore, x, y) : -1));
  const built = lots.findIndex(({x, y}) => mapBefore.testBounds(x, y) && !isHouse(mapBefore.getTileValue(x, y)) &&
                                           isHouse(mapAfter.getTileValue(x, y)));
  return built >= 0 && built !== scores.indexOf(Math.max(...scores));
});

// The heaviest traffic a block holds, reached by a drive that took it over
const trafficCapped: Branch = ({trafficBefore, trafficAfter}) => trafficBefore.some((value, i) =>
  value > Results.MAX_TRAFFIC_DENSITY - Results.TRIP_TRAFFIC && value < Results.MAX_TRAFFIC_DENSITY &&
  trafficAfter[i] === Results.MAX_TRAFFIC_DENSITY);

// A zone of the kind whose drive found no road, and which declined for it
const declinedWithNoRoad = (isKind: (value: number) => boolean) => visited((visit) =>
  isKind(visit.before) && droveTo(visit, Results.NO_ROAD_FOUND) && declined(visit));

// The branches of a commercial or industrial zone, whose population counts its level
function levelledZoneBranches(kind: string, isKind: (value: number) => boolean): Record<string, Branch> {
  return {
    [`${kind} zone grown`]: visited((visit) => stays(isKind, visit) && grew(visit)),
    [`${kind} zone emptied`]: visited((visit) =>
      stays(isKind, visit) && visit.populationBefore === 1 && visit.populationAfter === 0),
    [`${kind} zone declined from the second level or above`]: visited((visit) =>
      stays(isKind, visit) && visit.populationBefore! >= 2 && declined(visit)),
    [`${kind} zone with no road declined`]: declinedWithNoRoad(isKind),
  };
}

// The branches the points name, by name
const ZONE_BRANCHES: Record<string, Branch> = {
  // Residential
  "a house built on a lot that won a tie": builtOnATie,
  "a house removed": visited((visit) => visit.before === FREEZ && visit.after === FREEZ && declined(visit)),
  "houses built into a block": visited((visit) => visit.before === FREEZ && isBlock(visit.after)),
  "a block grown": visited((visit) => stays(isBlock, visit) && grew(visit)),
  "a block declined to a sparser block": visited((visit) => stays(isBlock, visit) && declined(visit)),
  "the sparsest block declined to houses": visited((visit) => isBlock(visit.before) && visit.after === FREEZ),
  "a hospital built": visited((visit) => visit.before === FREEZ && visit.after === HOSPITAL),
  "a hospital emptied": visited((visit) => visit.before === HOSPITAL && visit.after === FREEZ),
  "residential growth held back by pollution": visited((visit) =>
    TileUtils.isResidential(visit.before) && visit.pollution > Residential.MAX_POLLUTION && growthPassed(visit, "pollution") &&
    !called(visit, "incRateOfGrowth")),
  "a residential zone with no road declined": declinedWithNoRoad(TileUtils.isResidential),

  // Commercial
  ...levelledZoneBranches("a commercial", TileUtils.isCommercial),
  // growZone builds nothing on land worth less than a zone of the population needs
  "commercial growth held back by land value": visited((visit) =>
    TileUtils.isCommercial(visit.before) && visit.populationBefore! > visit.landValue >> 5 &&
    growthPassed(visit, "landValue") && !called(visit, "putZone")),
  "an empty commercial zone left as it is when it declines": visited((visit) =>
    TileUtils.isCommercial(visit.before) && visit.populationBefore === 0 && declinePassed(visit, "landValue")),

  // Industrial
  ...levelledZoneBranches("an industrial", TileUtils.isIndustrial),
  "an unpowered industrial zone assessed": visited((visit) =>
    TileUtils.isIndustrial(visit.before) && !visit.powered && draws(visit, "getChance").some((draw) =>
      draw.kind === "draw" && draw.result === true)),
  // A zone that grows or declines draws its variant, as industrialFound draws it; an empty one that grows is placed
  "an empty industrial zone left as it is when it declines": visited((visit) =>
    TileUtils.isIndustrial(visit.before) && visit.populationBefore === 0 && draws(visit, "getRandom16").length > 0 &&
    !called(visit, "putZone")),

  // Traffic, from any family's drive
  "traffic at its cap": trafficCapped,
  "a drive with no route": visited((visit) => droveTo(visit, Results.NO_ROUTE_FOUND)),
  // Backing up costs a drive distance, which shows only in a drive that then runs out of it
  "a drive backing up from a dead end, then going its whole distance without arriving": visited((visit) =>
    deadEnd(visit, true) && droveTo(visit, Results.NO_ROUTE_FOUND) && !deadEnd(visit, false)),
  "a drive giving up at a dead end": visited((visit) => deadEnd(visit, false)),
  "a drive arriving to its east": visited((visit) => arrived(visit, "east")),
  "a drive arriving to its west": visited((visit) => arrived(visit, "west")),
};

// The first call of the map scan in the fixture's run whose record with the family alone reaches every branch named
export function zonePoint(fixture: string, family: ZoneFamily, names: string[]): SnapshotPoint {
  const branches = names.map((name) => {
    if (!(name in ZONE_BRANCHES)) {
      throw new Error(`No zone branch named ${name}`);
    }

    return ZONE_BRANCHES[name];
  });
  const reachesAll = (trace: Trace) => branches.every((branch) => branch(trace));

  return {
    fixture,
    unit: "mapScanner.mapScan",
    call: 0,
    handlers: "each",
    where: (simulation, args) => unrecorded(() => reachesAll(traceOfCall(simulation, args, family))),
    reaches: {
      branch: names.join("; "),
      family,
      // A map scan's arguments are the columns of its strip
      test: (record: SnapshotRecord) =>
        unrecorded(() => reachesAll(traceOf(family, record.before, record.args as number[]))),
    },
  };
}
