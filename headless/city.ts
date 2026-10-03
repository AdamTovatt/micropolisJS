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

import { GameMap } from "../src/gameMap.js";
import { MapGenerator } from "../src/mapGenerator.js";
import { Random } from "../src/random";
import { Simulation as SimulationConstructor } from "../src/simulation.js";

// The parts of the legacy JavaScript simulation the headless code uses, typed: the types TypeScript infers from the
// JavaScript constructors lack the members they assign and define at run time.

export interface Budget {
  totalFunds: number;
  awaitingValues: boolean;
  spend(amount: number): void;
}

export interface Simulation {
  random: Random;
  blockMaps: object;
  budget: Budget;
  evaluation: {cityPop: number};
  save(saveData: object): void;
  step(): void;
  isPaused(): boolean;
  getDate(): {month: number, year: number};
  addEventListener(event: string, listener: (value: unknown) => void): void;
  removeEventListener(event: string, listener: (value: unknown) => void): void;
  _cityTime: number;
  _gameLevel: number;
  _map: {setTile(x: number, y: number, value: number, flags: number): void};
  _phaseCycle: number;
  _speed: number;
}

// The parts of a saved state the headless code reads or overrides. The rest is in docs/state-hash.md.
export interface SaveData {
  width: number;
  height: number;
  seed: number;
  randomState: number[];
  _speed: number;
}

const Constants = SimulationConstructor as unknown as {
  LEVEL_EASY: number, LEVEL_MED: number, LEVEL_HARD: number,
  SPEED_PAUSED: number, SPEED_SLOW: number, SPEED_MED: number, SPEED_FAST: number,
};

export const Level = {easy: Constants.LEVEL_EASY, medium: Constants.LEVEL_MED, hard: Constants.LEVEL_HARD};

export const Speed = {
  paused: Constants.SPEED_PAUSED, slow: Constants.SPEED_SLOW, medium: Constants.SPEED_MED, fast: Constants.SPEED_FAST,
};

// The speeds a city can run at: every speed but paused
export type RunningSpeed = Exclude<keyof typeof Speed, "paused">;

export const RUNNING_SPEEDS = (Object.keys(Speed) as (keyof typeof Speed)[])
  .filter((name): name is RunningSpeed => name !== "paused");

type Construct = new (gameMap: unknown, gameLevel: number | null, speed: number | null, seed: number | null,
                      savedGame: object | null) => Simulation;

const construct = SimulationConstructor as unknown as Construct;

// A new city on the map the seed generates, as the browser starts one
export function cityFromSeed(seed: number, level: number, speed: number): Simulation {
  return new construct(MapGenerator(Random.mapStream(seed)), level, speed, seed, null);
}

// A city restored from what Simulation.save wrote, without storage.js: the save's level and speed are its own
export function cityFromSave(saveData: SaveData): Simulation {
  // Loading copies the saved values, so the caller's object is never shared with the city
  return new construct(new GameMap(saveData.width, saveData.height), null, null, null, saveData);
}
