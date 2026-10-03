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

// The UI's own randomness, unseeded, so it never touches a simulation's stream. No simulation module may import it
// (CLAUDE.md). The one draw from it on the simulation's side is the seed a save from before seeds gets as it migrates
// (savedGame.ts).

const UINT32_RANGE = 2 ** 32;

// A fresh game seed, a uint32
function newSeed(): number {
  return Math.floor(Math.random() * UINT32_RANGE);
}

const UiRandom = {
  newSeed,
};

export { UiRandom };
