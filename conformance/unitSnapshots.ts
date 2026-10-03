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

// Records unit snapshots: calls of the simulation's units of work, each with the saved state before and after it and
// the events the simulation emitted, so the C# port can prove each unit on its own. conformance/README.md specifies the
// records; snapshotPoints.ts says which calls are recorded.

import { cityFromSave, SaveData, Speed } from "../headless/city";
import { startFromSave } from "../headless/runner";
import { BlockMapUtils } from "../src/blockMapUtils.js";
import { canonicalJson } from "../src/canonicalJson";
import { Commercial } from "../src/commercial.js";
import { EmergencyServices } from "../src/emergencyServices.js";
import { Industrial } from "../src/industrial.js";
import { MiscTiles } from "../src/miscTiles.js";
import { Residential } from "../src/residential.js";
import { Road } from "../src/road.js";
import { Stadia } from "../src/stadia.js";
import { plainSavedState } from "../src/stateHash";
import { Transport } from "../src/transport.js";

// --- The simulation's internals, which the recorder reaches into

type Method = (...args: unknown[]) => unknown;

interface ScanAction {
  criterion: unknown;
  action: Method;
}

interface Registry {
  _actions: ScanAction[];
}

export interface Internals {
  _speedCycle: number;
  _phaseCycle: number;
  _simCycle: number;
  _speed: number;
  _initialEvaluationPending: boolean;
  _gameLevel: number;
  _map: unknown;
  _mapScanner: Registry & {mapScan(startX: number, maxX: number, simData: unknown): void};
  _repairManager: Registry;
  _census: {take10Census(budget: unknown): void, take120Census(): void};
  _valves: {setValves(gameLevel: number, census: unknown, budget: unknown): void};
  _powerManager: {doPowerScan(census: unknown): void, registerHandlers(scanner: Registry, repairer: Registry): void};
  budget: {collectTax(gameLevel: number, census: unknown): void};
  evaluation: {cityEvaluation(simData: unknown): void};
  disasterManager: {doDisasters(gameLevel: number, census: unknown): void, doMeltdown(x: number, y: number): void};
  spriteManager: {makeExplosion(x: number, y: number): void, spriteList: unknown[]};
  blockMaps: unknown;
  random: unknown;
  _simulate(simData: unknown): void;
  _sendMessages(): void;
  _publishCityStatus(): void;
  _constructSimData(): unknown;
  _emitEvent(name: string, payload?: unknown): void;
  save(saveData: object): void;
  step(): void;
}

// The object a unit is a method of, as a table of methods
function methodsOf(owner: object): Record<string, Method> {
  return owner as unknown as Record<string, Method>;
}

// --- The units: each a function the cycle calls, under its TypeScript name, module and function

interface Unit {
  // The object it is a method of, on a simulation
  owner(simulation: Internals): object;
  method: string;
  // Its arguments that are not simulation state, as the cycle passes them: what a record holds as its arguments
  args(callArgs: unknown[]): number[];
  // Calls it on a simulation as the cycle does, with a record's arguments
  invoke(simulation: Internals, args: number[]): void;
}

const blockMapUtils = methodsOf(BlockMapUtils);

const UNITS: Record<string, Unit> = {
  "simulation._simulate": {
    owner: (simulation) => simulation, method: "_simulate", args: () => [],
    invoke: (simulation) => simulation._simulate(simulation._constructSimData()),
  },
  "valves.setValves": {
    owner: (simulation) => simulation._valves, method: "setValves", args: () => [],
    invoke: (simulation) => simulation._valves.setValves(simulation._gameLevel, simulation._census, simulation.budget),
  },
  "mapScanner.mapScan": {
    owner: (simulation) => simulation._mapScanner, method: "mapScan",
    args: (callArgs) => [callArgs[0] as number, callArgs[1] as number],
    invoke: (simulation, args) => simulation._mapScanner.mapScan(args[0], args[1], simulation._constructSimData()),
  },
  "census.take10Census": {
    owner: (simulation) => simulation._census, method: "take10Census", args: () => [],
    invoke: (simulation) => simulation._census.take10Census(simulation.budget),
  },
  "census.take120Census": {
    owner: (simulation) => simulation._census, method: "take120Census", args: () => [],
    invoke: (simulation) => simulation._census.take120Census(),
  },
  "budget.collectTax": {
    owner: (simulation) => simulation.budget, method: "collectTax", args: () => [],
    invoke: (simulation) => simulation.budget.collectTax(simulation._gameLevel, simulation._census),
  },
  "evaluation.cityEvaluation": {
    owner: (simulation) => simulation.evaluation, method: "cityEvaluation", args: () => [],
    invoke: (simulation) => simulation.evaluation.cityEvaluation(simulation._constructSimData()),
  },
  "blockMapUtils.neutraliseRateOfGrowthMap": {
    owner: () => BlockMapUtils, method: "neutraliseRateOfGrowthMap", args: () => [],
    invoke: (simulation) => blockMapUtils.neutraliseRateOfGrowthMap(simulation.blockMaps),
  },
  "blockMapUtils.neutraliseTrafficMap": {
    owner: () => BlockMapUtils, method: "neutraliseTrafficMap", args: () => [],
    invoke: (simulation) => blockMapUtils.neutraliseTrafficMap(simulation.blockMaps),
  },
  "simulation._sendMessages": {
    owner: (simulation) => simulation, method: "_sendMessages", args: () => [],
    invoke: (simulation) => simulation._sendMessages(),
  },
  "powerManager.doPowerScan": {
    owner: (simulation) => simulation._powerManager, method: "doPowerScan", args: () => [],
    invoke: (simulation) => simulation._powerManager.doPowerScan(simulation._census),
  },
  "blockMapUtils.pollutionTerrainLandValueScan": {
    owner: () => BlockMapUtils, method: "pollutionTerrainLandValueScan", args: () => [],
    invoke: (simulation) => blockMapUtils.pollutionTerrainLandValueScan(simulation._map, simulation._census,
                                                                        simulation.blockMaps, simulation.random),
  },
  "blockMapUtils.crimeScan": {
    owner: () => BlockMapUtils, method: "crimeScan", args: () => [],
    invoke: (simulation) => blockMapUtils.crimeScan(simulation._census, simulation.blockMaps),
  },
  "blockMapUtils.populationDensityScan": {
    owner: () => BlockMapUtils, method: "populationDensityScan", args: () => [],
    invoke: (simulation) => blockMapUtils.populationDensityScan(simulation._map, simulation.blockMaps),
  },
  "blockMapUtils.fireAnalysis": {
    owner: () => BlockMapUtils, method: "fireAnalysis", args: () => [],
    invoke: (simulation) => blockMapUtils.fireAnalysis(simulation.blockMaps),
  },
  "disasterManager.doDisasters": {
    owner: (simulation) => simulation.disasterManager, method: "doDisasters", args: () => [],
    invoke: (simulation) => simulation.disasterManager.doDisasters(simulation._gameLevel, simulation._census),
  },
  "simulation._publishCityStatus": {
    owner: (simulation) => simulation, method: "_publishCityStatus", args: () => [],
    invoke: (simulation) => simulation._publishCityStatus(),
  },
};

export type UnitName = keyof typeof UNITS;

export const UNIT_NAMES = Object.keys(UNITS);

// The units of BlockMapUtils, a module's object rather than a simulation's, which are wrapped once for every simulation
const MODULE_UNITS = UNIT_NAMES.filter((name) => name.startsWith("blockMapUtils."));

// The calls into the sprites and the disasters a unit may reach, which the C# stubs: noted as reached, never recorded
const SEAM: Record<string, {owner(simulation: Internals): object, method: string}> = {
  "spriteManager.makeExplosion": {owner: (simulation) => simulation.spriteManager, method: "makeExplosion"},
  "disasterManager.doMeltdown": {owner: (simulation) => simulation.disasterManager, method: "doMeltdown"},
};

// --- The handler families, in the order Simulation.init registers them, each with its handlers' names in the order
// it adds them. A record names the families it registered, and a handler reached by its family's name and its own.

type Register = (scanner: Registry, repairer: Registry, simulation: Internals) => void;

const FAMILIES: {name: string, register: Register, handlers: string[]}[] = [
  {name: "commercial", register: (scanner) => Commercial.registerHandlers(scanner), handlers: ["commercialFound"]},
  {name: "emergencyServices", register: (scanner) => EmergencyServices.registerHandlers(scanner),
   handlers: ["policeStationFound", "fireStationFound"]},
  {name: "industrial", register: (scanner) => Industrial.registerHandlers(scanner), handlers: ["industrialFound"]},
  {name: "miscTiles", register: (scanner) => MiscTiles.registerHandlers(scanner),
   handlers: ["fireFound", "radiationFound", "floodFound", "explosionFound"]},
  {name: "powerManager",
   register: (scanner, repairer, simulation) => simulation._powerManager.registerHandlers(scanner, repairer),
   handlers: ["coalPowerFound", "nuclearPowerFound"]},
  {name: "road", register: (scanner) => Road.registerHandlers(scanner), handlers: ["roadFound"]},
  {name: "residential", register: (scanner, repairer) => Residential.registerHandlers(scanner, repairer),
   handlers: ["residentialFound", "hospitalFound"]},
  {name: "stadia", register: (scanner, repairer) => Stadia.registerHandlers(scanner, repairer),
   handlers: ["emptyStadiumFound", "fullStadiumFound"]},
  {name: "transport", register: (scanner, repairer) => Transport.registerHandlers(scanner, repairer),
   handlers: ["railFound", "portFound", "airportFound"]},
];

export const FAMILY_NAMES = FAMILIES.map((family) => family.name);

// A handler's own name, empty for a method assigned to a prototype or a function a factory returns, and after "bound "
// for a bound function
function functionName(action: Method): string {
  return action.name.replace(/^bound /, "");
}

// Replaces the simulation's handlers with those of the families named, in the order given, each wrapped to note that
// it was reached under its name unless told not to
function registerFamilies(simulation: Internals, families: string[], wrapHandlers = true): void {
  const scanner = simulation._mapScanner;
  scanner._actions = [];
  simulation._repairManager._actions = [];

  for (const name of families) {
    const family = FAMILIES.find((candidate) => candidate.name === name);
    if (family === undefined) {
      throw new Error(`No handler family named ${name}`);
    }

    const first = scanner._actions.length;
    family.register(scanner, simulation._repairManager, simulation);
    const added = scanner._actions.slice(first);

    if (added.length !== family.handlers.length) {
      throw new Error(`The ${name} family registers ${added.length} handlers, not the ${family.handlers.length} named`);
    }

    added.forEach((entry, i) => {
      const handler = family.handlers[i];
      const own = functionName(entry.action);
      if (own !== "" && own !== handler) {
        throw new Error(`The ${name} family's handler ${i} is ${own}, not ${handler}`);
      }

      if (wrapHandlers) {
        entry.action = wrap(`${name}.${handler}`, entry.action);
      }
    });
  }
}

// Fails unless registering every family as the recorder does registers what Simulation.init did on the city given: the
// same criteria and handlers in the same order, and the same repairs
function checkFamilies(simulation: Internals): void {
  const scans = simulation._mapScanner._actions.slice();
  const repairs = simulation._repairManager._actions.slice();
  registerFamilies(simulation, FAMILY_NAMES, false);
  const ourScans = simulation._mapScanner._actions;

  // A bound handler is bound anew at each registration, so it is matched by its name, which for a method bound is
  // only "bound "
  const sameHandler = (a: Method, b: Method) => a === b || (a.name.startsWith("bound ") && a.name === b.name);
  const sameScans = scans.length === ourScans.length && scans.every((entry, i) =>
    entry.criterion === ourScans[i].criterion && sameHandler(entry.action, ourScans[i].action));

  if (!sameScans || canonicalJson(repairs) !== canonicalJson(simulation._repairManager._actions)) {
    throw new Error("The handler families register differently from Simulation.init");
  }
}

// --- Contexts: who a wrapped unit is running for. The recorder steps a live city, and replays units on cities of their
// own, one at a time, so the context on top of the stack is the city running.

interface Context {
  enter(name: string, args: unknown[], run: () => unknown): unknown;
}

const contexts: Context[] = [];

function within<T>(context: Context, run: () => T): T {
  contexts.push(context);
  try {
    return run();
  } finally {
    contexts.pop();
  }
}

// Runs what it is given and notes nothing: a city being built or saved
const NEUTRAL: Context = {enter: (_name, _args, run) => run()};

function wrap(name: string, original: Method): Method {
  return function(this: unknown, ...args: unknown[]): unknown {
    const run = () => original.apply(this, args);
    const context = contexts[contexts.length - 1];
    return context === undefined ? run() : context.enter(name, args, run);
  };
}

function wrapMethod(owner: object, method: string, name: string): () => void {
  const methods = methodsOf(owner);
  const original = methods[method];
  methods[method] = wrap(name, original);
  return () => {
    methods[method] = original;
  };
}

function wrapUnits(simulation: Internals): void {
  for (const name of UNIT_NAMES.filter((unit) => !MODULE_UNITS.includes(unit))) {
    wrapMethod(UNITS[name].owner(simulation), UNITS[name].method, name);
  }
}

// --- Records

export interface SnapshotEvent {
  name: string;
  payload?: unknown;
}

export interface SnapshotRecord {
  fixture: string;
  step: number;
  unit: string;
  args: number[];
  handlers: string[];
  reached: string[];
  events: SnapshotEvent[];
  before: object;
  after: object;
}

// Drops the members a plain object holds as undefined, as JSON.stringify does, so a message sent without data has none.
// Anything else is left for canonicalJson, which refuses what is not plain data.
function definedMembers(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(definedMembers);
  }

  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const members: Record<string, unknown> = {};
    for (const [key, member] of Object.entries(value)) {
      if (member !== undefined) {
        members[key] = definedMembers(member);
      }
    }

    return members;
  }

  return value;
}

function eventOf(name: string, payload: unknown): SnapshotEvent {
  if (payload === undefined) {
    return {name};
  }

  // A payload of null would read as no payload on the C# side, which holds JSON null as no node
  if (payload === null) {
    throw new Error(`The event ${name} was emitted with a null payload, which a record cannot tell from none`);
  }

  return {name, payload: JSON.parse(canonicalJson(definedMembers(payload)))};
}

// Notes every event the simulation emits while capturing
function captureEvents(simulation: Internals): SnapshotEvent[][] {
  const capturing: SnapshotEvent[][] = [];
  const original = simulation._emitEvent;

  simulation._emitEvent = function(this: Internals, name: string, payload?: unknown) {
    if (capturing.length > 0) {
      const event = eventOf(name, payload);
      capturing.forEach((events) => events.push(event));
    }

    original.call(this, name, payload);
  };

  return capturing;
}

// Notes the units and handlers a replayed call reaches, the call itself not counted, each once, as first reached
class ReplayContext implements Context {
  reached: string[] = [];
  private depth = 0;

  enter(name: string, _args: unknown[], run: () => unknown): unknown {
    if (this.depth > 0 && !this.reached.includes(name)) {
      this.reached.push(name);
    }

    this.depth++;
    try {
      return run();
    } finally {
      this.depth--;
    }
  }
}

// The unit called on a city restored from the state before it, with the families named registered
function replay(fixture: string, step: number, before: object, unit: string, args: number[],
                handlers: string[]): SnapshotRecord {
  const simulation = within(NEUTRAL, () => cityFromSave(before as SaveData)) as unknown as Internals;

  registerFamilies(simulation, handlers);
  wrapUnits(simulation);
  for (const name of Object.keys(SEAM)) {
    wrapMethod(SEAM[name].owner(simulation), SEAM[name].method, name);
  }

  const capturing = captureEvents(simulation);
  const events: SnapshotEvent[] = [];
  const context = new ReplayContext();

  capturing.push(events);
  within(context, () => UNITS[unit].invoke(simulation, args));
  capturing.pop();

  const after = within(NEUTRAL, () => plainSavedState(simulation));
  return {fixture, step, unit, args, handlers, reached: context.reached, events, before, after};
}

// --- Points

export interface SnapshotPoint {
  // The fixture whose city runs, at its saved speed
  fixture: string;
  unit: UnitName;
  // Which of the unit's calls, counting from 0, among those `where` accepts
  call: number;
  // Accepts a call, from the city as the call finds it and the call's arguments: every call when left out
  where?: (simulation: Internals, args: number[]) => boolean;
  // The handler families registered: every family when left out, and with "each", one record with none and one for each
  // family whose handlers the call reaches with every family registered (mapScan only)
  handlers?: "each";
  // A branch the record must reach, checked on each record the point makes
  reaches?: {branch: string, test(record: SnapshotRecord): boolean};
}

export function describePoint(point: SnapshotPoint): string {
  return `${point.fixture}: ${point.unit} call ${point.call}${point.handlers ? ` with ${point.handlers} family` : ""}`;
}

// A live city's run, recording the calls its points want
class LiveContext implements Context {
  step = 0;
  records: SnapshotRecord[] = [];
  private accepted: number[];
  private done: boolean[];

  constructor(private simulation: Internals, private points: SnapshotPoint[], private capturing: SnapshotEvent[][]) {
    this.accepted = points.map(() => 0);
    this.done = points.map(() => false);
  }

  finished(): boolean {
    return this.done.every((done) => done);
  }

  unfinished(): SnapshotPoint[] {
    return this.points.filter((_, i) => !this.done[i]);
  }

  enter(name: string, callArgs: unknown[], run: () => unknown): unknown {
    const unit = UNITS[name];
    if (unit === undefined) {
      return run();
    }

    const args = unit.args(callArgs);
    const wanted = this.points.flatMap((point, i) => {
      if (this.done[i] || point.unit !== name || (point.where && !point.where(this.simulation, args))) {
        return [];
      }

      if (this.accepted[i]++ !== point.call) {
        return [];
      }

      this.done[i] = true;
      return [point];
    });

    if (wanted.length === 0) {
      return run();
    }

    const fixture = wanted[0].fixture;
    const before = within(NEUTRAL, () => plainSavedState(this.simulation));
    const records: SnapshotRecord[] = [];
    // What the call does with every family registered, which the live city must do too
    const full = replay(fixture, this.step, before, name, args, FAMILY_NAMES);

    for (const point of wanted) {
      const made = this.recordsOf(point, full, before, args);
      for (const record of made) {
        if (point.reaches && !point.reaches.test(record)) {
          throw new Error(`The point ${describePoint(point)} does not reach ${point.reaches.branch}`);
        }
      }

      records.push(...made);
    }

    const events: SnapshotEvent[] = [];
    this.capturing.push(events);
    const result = run();
    this.capturing.splice(this.capturing.indexOf(events), 1);

    // The replay must be what the city did: a save restores the whole city, so a unit run from one does the same
    const after = within(NEUTRAL, () => plainSavedState(this.simulation));
    if (canonicalJson(after) !== canonicalJson(full.after) || canonicalJson(events) !== canonicalJson(full.events)) {
      throw new Error(`Replaying ${name} at step ${this.step} of ${fixture} does not do what the city did`);
    }

    this.records.push(...records);
    return result;
  }

  private recordsOf(point: SnapshotPoint, full: SnapshotRecord, before: object, args: number[]): SnapshotRecord[] {
    if (point.handlers === undefined) {
      return [full];
    }

    if (point.unit !== "mapScanner.mapScan") {
      throw new Error(`Only mapScan registers each family alone, not ${point.unit}`);
    }

    const reachedFamilies = FAMILIES.filter((family) =>
      family.handlers.some((handler) => full.reached.includes(`${family.name}.${handler}`)));

    return [[], ...reachedFamilies.map((family) => [family.name])].map((handlers) =>
      replay(point.fixture, this.step, before, point.unit, args, handlers));
  }
}

// How far a point's city runs to reach its call before the recorder gives up on it
const MAX_STEPS = 20000;

function recordRun(fixture: string, built: SaveData, points: SnapshotPoint[]): SnapshotRecord[] {
  const simulation = startFromSave(built, {}) as unknown as Internals;
  checkFamilies(simulation);
  wrapUnits(simulation);

  const live = new LiveContext(simulation, points, captureEvents(simulation));

  for (; !live.finished(); live.step++) {
    if (live.step >= MAX_STEPS) {
      throw new Error(`In ${MAX_STEPS} steps, no call was found for ${live.unfinished().map(describePoint).join("; ")}`);
    }

    within(live, () => simulation.step());

    // Each step of the city a snapshot comes from is one the C# can run before it ports the sprites
    if (simulation.spriteManager.spriteList.length > 0) {
      throw new Error(`${fixture} created a sprite at step ${live.step}: snapshots are recorded from sprite-free cities`);
    }
  }

  return live.records;
}

// Every record the points make, in a fixed order: by fixture, unit, step, arguments and handlers. Each fixture's city
// runs from its saved state as built, which the caller gives, checked against the fixture's golden hash.
export function recordSnapshots(points: SnapshotPoint[], built: Map<string, SaveData>): SnapshotRecord[] {
  const restores = MODULE_UNITS.map((name) => wrapMethod(BlockMapUtils, UNITS[name].method, name));

  try {
    const runs = new Map<string, SnapshotPoint[]>();
    for (const point of points) {
      if (!(point.unit in UNITS)) {
        throw new Error(`No unit named ${point.unit}`);
      }

      runs.set(point.fixture, [...(runs.get(point.fixture) ?? []), point]);
    }

    const records = Array.from(runs.entries()).flatMap(([fixture, runPoints]) => {
      const save = built.get(fixture);
      if (save === undefined) {
        throw new Error(`No saved state was given for ${fixture}`);
      }

      return recordRun(fixture, save, runPoints);
    });
    const keyed = records.map((record) => ({record, text: canonicalJson(record), key: sortKey(record)}));
    keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    // Two points may make the same record
    return keyed.filter((entry, i) => i === 0 || entry.text !== keyed[i - 1].text).map((entry) => entry.record);
  } finally {
    restores.forEach((restore) => restore());
  }
}

function speedOf(record: SnapshotRecord): number {
  return (record.before as {simulation: {speed: number}}).simulation.speed;
}

function sortKey(record: SnapshotRecord): string {
  const pad = (n: number) => String(n).padStart(8, "0");
  return [record.fixture, record.unit, pad(record.step), record.args.map(pad).join(","), record.handlers.join(",")]
    .join("|");
}

export function recordSpeed(record: SnapshotRecord): string {
  const speed = speedOf(record);
  return Object.keys(Speed).find((name) => Speed[name as keyof typeof Speed] === speed)!;
}
