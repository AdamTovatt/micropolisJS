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
  // the city had sprites moving, and whether random disasters could strike it.
  yearEnds: number;
  budgets: YearBudget[];
  sprites: boolean;
  disasters: boolean;
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
  const disasters = city.disasterManager.disastersEnabled;
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
    city.step();
    capturing.pop();
    events.push(...stepEvents.map((event) => ({step, ...event})));

    sprites = sprites || city.spriteManager.spriteList.length > 0;

    if ((step + 1) % interval === 0 || step + 1 === steps) {
      checkpoints.push({step: step + 1, hash: await stateHash(city)});
    }
  }

  return {
    seed: "seed" in start ? start.seed : null, fixture: "fixture" in start ? start.fixture : null,
    level: nameOf(Level, city._gameLevel), speed, steps, checkpoints, events, yearEnds, budgets, sprites, disasters,
  };
}
