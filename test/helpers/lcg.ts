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

// A small deterministic generator for a test's random inputs, the same on every run. It is the test's own, so the
// inputs do not draw on the simulation's random stream. Each call returns a whole number from 0 below the limit.
export function lcg(seed: number): (limit: number) => number {
    let state = Math.imul(seed, 2654435761) >>> 0;
    return (limit: number) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return Math.floor((state / 0x100000000) * limit);
    };
}
