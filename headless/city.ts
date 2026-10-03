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

import { ReceivedCommand } from "../src/commands";
import type { EvaluationSource } from "../src/evaluationRecord";
import { GameMap } from "../src/gameMap.js";
import { MapGenerator } from "../src/mapGenerator.js";
import { CommandResult, type EvaluationRecord, QueryAnswer } from "../src/protocol";
import { Random } from "../src/random";
import { Simulation as SimulationConstructor } from "../src/simulation.js";

// The parts of the legacy JavaScript simulation the headless code uses, typed: the types TypeScript infers from the
// JavaScript constructors lack the members they assign and define at run time.

export interface Budget {
  totalFunds: number;
  spend(amount: number): void;
}

export type GameMapInstance = InstanceType<typeof GameMap>;

export interface Simulation {
  random: Random;
  budget: Budget;
  evaluation: EvaluationSource;
  evaluationRecord(): EvaluationRecord;
  save(saveData: object): void;
  load(saveData: object): void;
  applyCommands(received: ReceivedCommand[]): CommandResult[];
  answerQuery(query: unknown): QueryAnswer;
  step(): void;
  isPaused(): boolean;
  getSpeed(): number;
  getMap(): GameMapInstance;
  getDate(): {month: number, year: number};
  addEventListener(event: string, listener: (value: unknown) => void): void;
  removeEventListener(event: string, listener: (value: unknown) => void): void;
  // The raw counters, which the runner's stall check models independently
  _cityTime: number;
  _phaseCycle: number;
  _speedCycle: number;
}

// The parts of a saved state the headless code reads or overrides. The rest is in docs/state-hash.md.
export interface SaveData {
  simulation: {seed: number, randomState: number[], gameLevel: number, speed: number};
  map: {width: number, height: number};
}

export const Level = {
  easy: SimulationConstructor.LEVEL_EASY, medium: SimulationConstructor.LEVEL_MED,
  hard: SimulationConstructor.LEVEL_HARD,
};

export const Speed = {
  paused: SimulationConstructor.SPEED_PAUSED, slow: SimulationConstructor.SPEED_SLOW,
  medium: SimulationConstructor.SPEED_MED, fast: SimulationConstructor.SPEED_FAST,
};

// The speeds a city can run at: every speed but paused
export type RunningSpeed = Exclude<keyof typeof Speed, "paused">;

export const RUNNING_SPEEDS = (Object.keys(Speed) as (keyof typeof Speed)[])
  .filter((name): name is RunningSpeed => name !== "paused");

export type LevelName = keyof typeof Level;

// The name a table of named values, such as Level or Speed, gives a value of it
export function nameOf<Name extends string>(table: Record<Name, number>, value: number): Name {
  const name = (Object.keys(table) as Name[]).find((candidate) => table[candidate] === value);
  if (name === undefined) {
    throw new Error(`No name is given to ${value}: the names are ${Object.keys(table).join(", ")}`);
  }

  return name;
}

type Construct = (new (gameMap: unknown, gameLevel: number, speed: number, seed: number) => Simulation) & {
  fromSave(saveData: SaveData): Simulation;
};

const construct = SimulationConstructor as unknown as Construct;

// A new city on the map the seed generates, as the browser starts one
export function cityFromSeed(seed: number, level: number, speed: number): Simulation {
  return cityOnMap(MapGenerator(Random.mapStream(seed)), level, speed, seed);
}

// A new city on the map given, simulated from the stream of the seed given, such as one on a blank map
export function cityOnMap(map: GameMapInstance, level: number, speed: number, seed: number): Simulation {
  return new construct(map, level, speed, seed);
}

// A city restored from what Simulation.save wrote, without the save format of savedGame.ts. Loading copies the saved
// values, so the caller's object is never shared with the city.
export function cityFromSave(saveData: SaveData): Simulation {
  return construct.fromSave(saveData);
}
