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

import { mouseBoxRect } from "../src/mouseBox";

describe("the mouse box", () => {

    it("strokes a three pixel line half a line outside the area, so the line clears it", () => {
        expect(mouseBoxRect({x: 32, y: 48}, 48, 64)).toEqual({x: 30.5, y: 46.5, width: 51, height: 67});
    });
});
