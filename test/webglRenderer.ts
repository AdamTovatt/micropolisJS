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

import { flipRows } from "../src/webglRenderer";

describe("the pixels WebGL reads", () => {

    it("come from the bottom row up, and are turned to run from the top row down", () => {
        // Two pixels across, three rows: each pixel's red is its row as WebGL reads it, its green its column
        const read = new Uint8Array([0, 0, 0, 255, 0, 1, 0, 255, 1, 0, 0, 255, 1, 1, 0, 255, 2, 0, 0, 255, 2, 1, 0, 255]);

        expect(Array.from(flipRows(read, 2, 3)))
            .toEqual([2, 0, 0, 255, 2, 1, 0, 255, 1, 0, 0, 255, 1, 1, 0, 255, 0, 0, 0, 255, 0, 1, 0, 255]);
    });
});
