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

import { Random } from "../../src/random";

// Streams whose 16-bit draws are chosen by the test. Only the raw draw is replaced, so getRandom, getChance and the
// rest behave exactly as they do on a real stream: getRandom(max) of a small draw below max returns the draw.

function checkDraw(draw: number): void {
    if (!Number.isInteger(draw) || draw < 0 || draw > 0xffff) {
        throw new Error(`A 16-bit draw must be an integer in [0, 65535], got ${draw}`);
    }
}

// A stream whose 16-bit draws are the given values, in order. Drawing more than that fails the test.
export function streamDrawing(draws: number[]): Random {
    draws.forEach(checkDraw);
    const random = Random.fromSeed(0);
    let i = 0;

    random.next = () => {
        if (i >= draws.length) {
            throw new Error(`The test stream ran out after ${draws.length} draws`);
        }

        return draws[i++] * 0x10000;
    };

    return random;
}

// A stream whose every 16-bit draw is the given value
export function streamAlwaysDrawing(draw: number): Random {
    checkDraw(draw);
    const random = Random.fromSeed(0);
    random.next = () => draw * 0x10000;
    return random;
}
