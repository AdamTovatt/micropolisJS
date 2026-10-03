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

import { canonicalJson } from "./canonicalJson";

// The state hash: SHA-256 over the UTF-8 bytes of the canonical text of everything Simulation.save writes, which
// includes the random stream's state. docs/state-hash.md specifies it for the C# port. It uses Web Crypto, which
// both Node and the browser provide.

interface Saveable {
  save(saveData: object): void;
}

// What the simulation saves. It may share arrays and objects with the live simulation, so it is read at once.
export function savedState(simulation: Saveable): object {
  const saveData = {};
  simulation.save(saveData);
  return saveData;
}

// What the simulation saves, as plain data that shares nothing with it, as it would be after a trip through storage
export function plainSavedState(simulation: Saveable): object {
  return JSON.parse(canonicalJson(savedState(simulation)));
}

export async function hashSavedState(saveData: object): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(saveData));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function stateHash(simulation: Saveable): Promise<string> {
  return hashSavedState(savedState(simulation));
}
