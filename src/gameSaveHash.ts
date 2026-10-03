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

import { GameMap } from "./gameMap.js";
import { Simulation } from "./simulation.js";
import { hashSavedState, savedState } from "./stateHash";

// The state hash of the city in a game's save, as the browser writes it to storage. stateHash.ts hashes any saveable
// state and knows nothing of the simulation; this knows which of a game's keys are the simulation's.

// The keys Simulation.save writes, which a game's save holds beside the game's own, such as the city's name
const SIMULATION_KEYS = Object.keys(savedState(new Simulation(new GameMap(120, 100), Simulation.LEVEL_EASY,
                                                              Simulation.SPEED_MED, 1)));

// The state hash (stateHash.ts) of the city in a game's save: the hash of what the simulation saved
export async function gameSaveHash(save: Record<string, unknown>): Promise<string> {
  const missing = SIMULATION_KEYS.filter((key) => !(key in save));
  if (missing.length > 0) {
    throw new Error(`The save lacks the simulation's ${missing.join(", ")}`);
  }

  return hashSavedState(Object.fromEntries(SIMULATION_KEYS.map((key) => [key, save[key]])));
}
