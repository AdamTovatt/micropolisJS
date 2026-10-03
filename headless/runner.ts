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

import { BUDGET_NEEDED } from "../src/messages";
import { Random } from "../src/random";
import { stateHash } from "../src/stateHash";
import { cityFromSave, cityFromSeed, Level, RunningSpeed, SaveData, Simulation, Speed } from "./city";
import { fixtureSave } from "./fixtures/index";

// Starts a city from a seed or a fixture and advances it step by step, as fast as the CPU allows. A run never
// stalls silently: it fails when the simulation is paused or waits for the player.

export interface Start {
  // A map generated from this seed, or the named fixture: exactly one
  seed?: number;
  fixture?: string;
  // Replaces a fixture's stream with the simulation stream of this seed. A fixture's saved stream is otherwise
  // authoritative.
  reseed?: number;
  // Overrides the saved speed. A new city from a seed starts at medium, as in the browser.
  speed?: RunningSpeed;
}

export interface Summary {
  hash: string;
  year: number;
  population: number;
  funds: number;
}

export function startCity(start: Start): Simulation {
  if ((start.seed === undefined) === (start.fixture === undefined)) {
    throw new Error("A run starts from either a seed or a fixture");
  }

  if (start.seed !== undefined) {
    if (start.reseed !== undefined) {
      throw new Error("Reseeding replaces a fixture's stream: a city from a seed already has the stream of its seed");
    }

    return cityFromSeed(start.seed, Level.easy, Speed[start.speed ?? "medium"]);
  }

  // Loaded from its saved state, so a fixture always goes through the load path
  return startFromSave(fixtureSave(start.fixture!), start);
}

// A city from a saved state, with a fixture's reseed and speed options
export function startFromSave(saved: SaveData, options: {reseed?: number, speed?: RunningSpeed}): Simulation {
  const saveData = {...saved};

  if (options.reseed !== undefined) {
    saveData.seed = options.reseed;
    saveData.randomState = Random.simulationStream(options.reseed).getState();
  }

  if (options.speed !== undefined) {
    saveData._speed = Speed[options.speed];
  } else if (saveData._speed === Speed.paused) {
    throw new Error("The city is saved paused: give a speed to run it");
  }

  return cityFromSave(saveData);
}

export async function summarise(city: Simulation): Promise<Summary> {
  return {
    hash: await stateHash(city),
    year: city.getDate().year,
    population: city.evaluation.cityPop,
    funds: city.budget.totalFunds,
  };
}

// Never steps a paused simulation, and fails rather than leaving the simulation waiting for the player's budget
export function advance(city: Simulation, steps: number): void {
  if (!Number.isInteger(steps) || steps < 0) {
    throw new Error(`A run takes a whole number of steps, got ${steps}`);
  }

  if (city.isPaused()) {
    throw new Error("The simulation is paused: a run never steps a paused simulation");
  }

  let budgetNeeded = false;
  const onBudgetNeeded = () => {
    budgetNeeded = true;
  };
  city.addEventListener(BUDGET_NEEDED, onBudgetNeeded);

  try {
    for (let i = 0; i < steps; i++) {
      city.step();

      if (budgetNeeded) {
        throw new Error(`The simulation stopped for the player's budget after ${i + 1} steps: keep auto-budget ` +
                        "on, with funds to cover it");
      }
    }
  } finally {
    city.removeEventListener(BUDGET_NEEDED, onBudgetNeeded);
  }
}
