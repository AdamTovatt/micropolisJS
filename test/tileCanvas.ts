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

import { mustRepaintAll } from "../src/tileCanvas";

describe("the monster TV's canvas", () => {

    describe("deciding to repaint every tile", () => {

        it("repaints only what changed while the canvas keeps its size", () => {
            expect(mustRepaintAll(1280, 900, 1280, 900)).toBe(false);
        });

        it("repaints every tile when the canvas changes width or height", () => {
            expect(mustRepaintAll(1440, 900, 1280, 900)).toBe(true);
            expect(mustRepaintAll(1280, 800, 1280, 900)).toBe(true);
        });
    });
});
