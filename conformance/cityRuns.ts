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

// Records city runs: a city stepped at one speed, with its state hash at each checkpoint and every event the
// simulation emitted on the way, so the C# port proves the whole cycle against the TypeScript. conformance/README.md
// specifies the records.

import { cityFromSeed, Level, LevelName, nameOf, RunningSpeed, SaveData, Speed } from "../headless/city";
import { startFromSave } from "../headless/runner";
import { stateHash } from "../src/stateHash";
import { captureEvents, Internals, RecordedEvent, replaceMethod } from "./instrumentation";

// Where a run's city starts: a new city on the map a seed generates, at a level, or a fixture's city as built, at its
// saved level
export type RunStart = {seed: number, level: LevelName} | {fixture: string, built: SaveData};

export interface RunEvent extends RecordedEvent {
  // The step, counted from 0, during which the event was emitted
  step: number;
}

export interface Checkpoint {
  step: number;
  hash: string;
}

// A year's budget, which a city with people has at each year end: with auto-budget on or off, and whether auto-budget
// ran short and turned itself off
export interface YearBudget {
  autoBudget: boolean;
  shortfall: boolean;
}

export interface CityRun {
  seed: number | null;
  fixture: string | null;
  level: LevelName;
  speed: RunningSpeed;
  steps: number;
  // The state hash at step 0, as the city starts, after every interval of steps, and after the last step
  checkpoints: Checkpoint[];
  events: RunEvent[];
  // Not written: what the generator checks the runs cover. Each year end the run reaches, each year's budget, whether
  // a live sprite moved, and each random disaster that struck, by the method that made it.
  yearEnds: number;
  budgets: YearBudget[];
  sprites: boolean;
  disasters: string[];
}

// What a random disaster calls to strike, on the disaster manager or the sprite manager
const RANDOM_DISASTERS = {
  disasterManager: ["setFire", "makeFlood", "makeEarthquake"],
  spriteManager: ["makeTornado", "makeMonster"],
} as const;

export const RANDOM_DISASTER_NAMES: string[] = Object.values(RANDOM_DISASTERS).flat();

// Notes each random disaster that strikes the city: a run applies no commands, so no player triggers one
function watchRandomDisasters(city: Internals, struck: string[]): void {
  for (const owner of Object.keys(RANDOM_DISASTERS) as (keyof typeof RANDOM_DISASTERS)[]) {
    for (const method of RANDOM_DISASTERS[owner]) {
      replaceMethod(city[owner], method, (original) => function(this: unknown, ...args: unknown[]) {
        struck.push(method);
        return original.apply(this, args);
      });
    }
  }
}

// Whether a sprite live before the step is live after it, somewhere else
function liveSpriteMoved(city: Internals, step: () => void): boolean {
  const before = new Map(city.spriteManager.getLiveSprites().map((sprite) => [sprite, {x: sprite.x, y: sprite.y}]));
  step();

  return city.spriteManager.getLiveSprites().some((sprite) => {
    const was = before.get(sprite);
    return was !== undefined && (was.x !== sprite.x || was.y !== sprite.y);
  });
}

function startCity(start: RunStart, speed: RunningSpeed): Internals {
  const city = "seed" in start ? cityFromSeed(start.seed, Level[start.level], Speed[speed])
                               : startFromSave(start.built, {speed});
  return city as unknown as Internals;
}

// A run's city, or where it starts, by its fixture or its seed
export function describeStart(start: {seed?: number | null, fixture?: string | null}): string {
  return start.fixture ?? `seed ${start.seed}`;
}

// The city run for the steps at the speed, checkpointed every interval of steps
export async function recordRun(start: RunStart, speed: RunningSpeed, steps: number,
                                interval: number): Promise<CityRun> {
  const city = startCity(start, speed);
  const disasters: string[] = [];
  watchRandomDisasters(city, disasters);
  let sprites = false;

  const capturing = captureEvents(city);
  const checkpoints: Checkpoint[] = [{step: 0, hash: await stateHash(city)}];
  const events: RunEvent[] = [];

  let yearEnds = 0;
  const budgets: YearBudget[] = [];
  replaceMethod(city.budget, "collectTax", (original) => function(this: unknown, ...args: unknown[]) {
    yearEnds++;
    return original.apply(this, args);
  });
  replaceMethod(city.budget, "doBudgetNow", (original) => function(this: {autoBudget: boolean}, ...args: unknown[]) {
    const autoBudget = this.autoBudget;
    const result = original.apply(this, args);
    budgets.push({autoBudget, shortfall: autoBudget && !this.autoBudget});
    return result;
  });

  for (let step = 0; step < steps; step++) {
    const stepEvents: RecordedEvent[] = [];
    capturing.push(stepEvents);
    sprites = liveSpriteMoved(city, () => city.step()) || sprites;
    capturing.pop();
    events.push(...stepEvents.map((event) => ({step, ...event})));

    if ((step + 1) % interval === 0 || step + 1 === steps) {
      checkpoints.push({step: step + 1, hash: await stateHash(city)});
    }
  }

  return {
    seed: "seed" in start ? start.seed : null, fixture: "fixture" in start ? start.fixture : null,
    level: nameOf(Level, city._gameLevel), speed, steps, checkpoints, events, yearEnds, budgets, sprites, disasters,
  };
}
