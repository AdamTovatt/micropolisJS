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

// Traces: a fixture's saved city, then a run of calls into the sprites, the disasters and the transport handlers, each
// with the state hash after it and the events it emitted, so the C# port proves them call by call. A unit snapshot keeps
// the whole state before and after one call; a trace keeps a hash, so it can afford thousands of calls, and a
// mismatch names the first call after which the states differ. conformance/README.md specifies them, and
// tracePoints.ts lists them.

import { cityFromSave, SaveData } from "../headless/city";
import * as Messages from "../src/messages";
import { stateHash } from "../src/stateHash";
import { Transport } from "../src/transport.js";
import { captureEvents, Internals, RecordedEvent, replaceMethod } from "./instrumentation";
import { savedMap, SavedMap } from "./savedMap";

// The hex digits of the state hash a call keeps: enough that two states sharing them by chance never happens in
// practice, few enough to keep thousands of calls small
const TRACE_HASH_DIGITS = 12;

export interface TraceCall {
  unit: string;
  args: number[];
  hash: string;
  events: RecordedEvent[];
}

// A tile of the map, set to the raw value given
export interface TraceTile {
  x: number;
  y: number;
  value: number;
}

export interface Trace {
  name: string;
  fixture: string;
  point: string;
  // Keys of the save, as dotted paths, set to the values given before the city is built from it
  changes: Record<string, unknown>;
  // Tiles of the saved map set after the changes, for a layout no fixture builds
  tiles: TraceTile[];
  calls: TraceCall[];
}

// What a trace reads and calls of the city beyond what the unit snapshots do: the city is JavaScript, so its reader
// declares the shape
export type TraceCity = Internals & {
  _map: {width: number, height: number, getTile(x: number, y: number): {getValue(): number, isZone(): boolean}};
  spriteManager: {
    moveObjects(simData: unknown): void;
    makeMonster(): void;
    makeMonsterAt(x: number, y: number): void;
    makeTornado(): void;
    getSprite(type: number): {frame: number} | null;
  };
  disasterManager: {
    setFire(): void;
    makeFire(): void;
    makeFlood(): void;
    makeCrash(): void;
    makeMeltdown(): void;
    makeEarthquake(): void;
  };
};

// A trace to record: the fixture's save at a point, the changes and tiles to set in it, and what to call on the city
// built from it
export interface TraceDefinition {
  name: string;
  fixture: string;
  point: string;
  changes: Record<string, unknown>;
  // The tiles to set, from the saved map
  tiles?(map: SavedMap): TraceTile[];
  run(trace: TraceRecorder): Promise<void>;
}

type Handler = (map: unknown, x: number, y: number, simData: unknown) => void;
const transport = Transport as unknown as Record<string, Handler>;

// The calls a trace may make, by name, each with its arguments: what the C# side's table runs. The disasters'
// doDisasters takes the game level as its argument; the transport handlers take the tile they are found on.
const UNITS: Record<string, (city: TraceCity, args: number[]) => void> = {
  "spriteManager.moveObjects": (city) => city.spriteManager.moveObjects(city._constructSimData()),
  "spriteManager.makeMonster": (city) => city.spriteManager.makeMonster(),
  "spriteManager.makeMonsterAt": (city, [x, y]) => city.spriteManager.makeMonsterAt(x, y),
  "spriteManager.makeTornado": (city) => city.spriteManager.makeTornado(),
  "spriteManager.makeExplosion": (city, [x, y]) => city.spriteManager.makeExplosion(x, y),
  "disasterManager.doDisasters": (city, [gameLevel]) => city.disasterManager.doDisasters(gameLevel, city._census),
  "disasterManager.setFire": (city) => city.disasterManager.setFire(),
  "disasterManager.makeFire": (city) => city.disasterManager.makeFire(),
  "disasterManager.makeFlood": (city) => city.disasterManager.makeFlood(),
  "disasterManager.makeCrash": (city) => city.disasterManager.makeCrash(),
  "disasterManager.makeMeltdown": (city) => city.disasterManager.makeMeltdown(),
  "disasterManager.makeEarthquake": (city) => city.disasterManager.makeEarthquake(),
  "transport.railFound": (city, [x, y]) => transport.railFound(city._map, x, y, city._constructSimData()),
  "transport.portFound": (city, [x, y]) => transport.portFound(city._map, x, y, city._constructSimData()),
  "transport.airportFound": (city, [x, y]) => transport.airportFound(city._map, x, y, city._constructSimData()),
};

const TRACE_UNIT_NAMES = Object.keys(UNITS);

function announces(call: TraceCall, subject: string): boolean {
  return call.events.some((event) => {
    const payload = event.payload as {subject?: string} | undefined;
    return event.name === Messages.FRONT_END_MESSAGE && payload?.subject === subject;
  });
}

// Records a trace's calls on its city, each with the state hash after it and the events it emitted
export class TraceRecorder {
  readonly calls: TraceCall[] = [];
  private readonly capturing: RecordedEvent[][];

  constructor(readonly city: TraceCity, readonly tiles: TraceTile[]) {
    this.capturing = captureEvents(city);
  }

  async call(unit: string, ...args: number[]): Promise<void> {
    const events: RecordedEvent[] = [];
    this.capturing.push(events);
    try {
      UNITS[unit](this.city, args);
    } finally {
      this.capturing.splice(this.capturing.indexOf(events), 1);
    }

    const hash = (await stateHash(this.city)).slice(0, TRACE_HASH_DIGITS);
    this.calls.push({unit, args, hash, events});
  }

  async moves(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.call("spriteManager.moveObjects");
    }
  }

  // Whether any call so far emitted a front-end message about the subject
  heard(subject: string): boolean {
    return this.calls.some((call) => announces(call, subject));
  }

  // Whether the last call emitted a front-end message about the subject
  heardLast(subject: string): boolean {
    return this.calls.length > 0 && announces(this.calls[this.calls.length - 1], subject);
  }

  alive(type: number): boolean {
    return this.city.spriteManager.getSprite(type) !== null;
  }

  // The frame of the live sprite of the type, or 0 with none
  frame(type: number): number {
    return this.city.spriteManager.getSprite(type)?.frame ?? 0;
  }

  tileValue(x: number, y: number): number {
    return this.city._map.getTile(x, y).getValue();
  }

  // The arguments of each call of the owner's method from now on, which it still makes
  spying(owner: object, method: string): unknown[][] {
    const calls: unknown[][] = [];
    replaceMethod(owner, method, (original) => function(this: unknown, ...args: unknown[]) {
      calls.push(args);
      return original.apply(this, args);
    });
    return calls;
  }

  // Each draw up to a maximum from the city's stream from now on, with the maximum and what it came up
  drawing(): {max: number, result: number}[] {
    const draws: {max: number, result: number}[] = [];
    replaceMethod(this.city.random as object, "getRandom", (original) => function(this: unknown, ...args: unknown[]) {
      const result = original.apply(this, args) as number;
      draws.push({max: args[0] as number, result});
      return result;
    });
    return draws;
  }
}

export function ensure(condition: boolean, trace: string, what: string): void {
  if (!condition) {
    throw new Error(`The trace ${trace} would not cover ${what}`);
  }
}

// A save, with the tiles of its map
type TiledSave = SaveData & {map: {tiles: number[]}};

// Sets each change's dotted path in the save, then each tile of its map
function withChanges(save: TiledSave, changes: Record<string, unknown>, tiles: TraceTile[]): SaveData {
  const changed = structuredClone(save);
  for (const [key, value] of Object.entries(changes)) {
    const names = key.split(".");
    const owner = names.slice(0, -1).reduce((node, name) => node[name] as Record<string, unknown>,
                                            changed as unknown as Record<string, unknown>);
    if (!(names[names.length - 1] in owner)) {
      throw new Error(`A trace changes ${key}, which the save doesn't hold`);
    }
    owner[names[names.length - 1]] = value;
  }

  const {width, height} = changed.map;
  for (const {x, y, value} of tiles) {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      throw new Error(`A trace sets the tile (${x}, ${y}), which is off the map`);
    }
    changed.map.tiles[y * width + x] = value;
  }
  return changed;
}

// Each trace defined, each from its fixture's save at its point, which save gives
export async function recordTraces(definitions: TraceDefinition[],
                                   save: (fixture: string, point: string) => SaveData): Promise<Trace[]> {
  const traces: Trace[] = [];

  for (const definition of definitions) {
    const {name, fixture, point, changes} = definition;
    const saved = save(fixture, point) as TiledSave;
    const tiles = definition.tiles?.(savedMap(saved.map)) ?? [];
    const city = cityFromSave(withChanges(saved, changes, tiles)) as unknown as TraceCity;
    const recorder = new TraceRecorder(city, tiles);
    await definition.run(recorder);
    traces.push({name, fixture, point, changes, tiles, calls: recorder.calls});
  }

  for (const unit of TRACE_UNIT_NAMES) {
    ensure(traces.some((trace) => trace.calls.some((call) => call.unit === unit)), "any", unit);
  }

  return traces;
}
