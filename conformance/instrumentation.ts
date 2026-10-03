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

// What the conformance recorders reach into the simulation with: its internals, typed, the events it emits, captured as
// a record holds them, and its methods, replaced to watch them.

import { GameMapInstance } from "../headless/city";
import { BlockMap } from "../src/blockMap";
import { canonicalJson } from "../src/canonicalJson";
import { ReceivedCommand } from "../src/commands";

// --- The simulation's internals

export type Method = (...args: unknown[]) => unknown;

interface ScanAction {
  criterion: unknown;
  action: Method;
}

export interface Registry {
  _actions: ScanAction[];
}

export interface Internals {
  _speedCycle: number;
  _phaseCycle: number;
  _simCycle: number;
  _cityTime: number;
  _speed: number;
  _initialEvaluationPending: boolean;
  _gameLevel: number;
  _map: GameMapInstance;
  _mapScanner: Registry & {mapScan(startX: number, maxX: number, simData: unknown): void};
  _repairManager: Registry;
  _census: {
    take10Census(budget: unknown): void, take120Census(): void,
    crimeAverage: number, crimeRamp: number, pollutionAverage: number, pollutionRamp: number,
  };
  _valves: {setValves(gameLevel: number, census: unknown, budget: unknown): void};
  _powerManager: {doPowerScan(census: unknown): void, registerHandlers(scanner: Registry, repairer: Registry): void};
  budget: {collectTax(gameLevel: number, census: unknown): void, roadEffect: number, autoBudget: boolean};
  evaluation: {cityEvaluation(simData: unknown): void};
  disasterManager: {
    doDisasters(gameLevel: number, census: unknown): void, doMeltdown(x: number, y: number): void,
    disastersEnabled: boolean,
  };
  spriteManager: {makeExplosion(x: number, y: number): void, spriteList: unknown[]};
  // The block maps, by name, as the Simulation constructor makes them
  blockMaps: Record<string, BlockMap>;
  random: unknown;
  _traffic: {_stack: unknown[]};
  _simulate(simData: unknown): void;
  applyCommands(received: ReceivedCommand[]): unknown[];
  _sendMessages(): void;
  _publishCityStatus(): void;
  _constructSimData(): unknown;
  _emitEvent(name: string, payload?: unknown): void;
  save(saveData: object): void;
  load(saveData: object): void;
  step(): void;
}

// --- Methods, replaced to watch them

// An object, as a table of methods
export function methodsOf(owner: object): Record<string, Method> {
  return owner as unknown as Record<string, Method>;
}

// Replaces an object's method with what `replace` makes of it, and gives what restores it, as the object's own or as
// what it inherits. It throws when the object has no such method, so a renamed one fails rather than going unwatched.
export function replaceMethod(owner: object, method: string, replace: (original: Method) => Method): () => void {
  const methods = methodsOf(owner);
  const original = methods[method];
  if (typeof original !== "function") {
    throw new Error(`No method named ${method} to replace`);
  }

  const own = Object.prototype.hasOwnProperty.call(owner, method);
  methods[method] = replace(original);
  return () => {
    if (own) {
      methods[method] = original;
    } else {
      delete methods[method];
    }
  };
}

// --- Events, as a record holds them

export interface RecordedEvent {
  name: string;
  payload?: unknown;
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

function eventOf(name: string, payload: unknown): RecordedEvent {
  if (payload === undefined) {
    return {name};
  }

  // A payload of null would read as no payload on the C# side, which holds JSON null as no node
  if (payload === null) {
    throw new Error(`The event ${name} was emitted with a null payload, which a record cannot tell from none`);
  }

  return {name, payload: JSON.parse(canonicalJson(definedMembers(payload)))};
}

// Notes every event the simulation emits in each list pushed onto the result, while one is
export function captureEvents(simulation: Internals): RecordedEvent[][] {
  const capturing: RecordedEvent[][] = [];
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
