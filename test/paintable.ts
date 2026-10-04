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

import { spritesInView } from "../src/paintable";
import type { PaintableSprite } from "../src/paintable";

describe("the sprites in view", () => {

    const at = (x: number, y: number): PaintableSprite => ({type: 1, frame: 1, x, y, width: 48});

    // The view from tile (2, 3), 160 by 96 pixels: map pixels 32 to 192 across and 48 to 144 down
    const inView = (sprites: PaintableSprite[]) => spritesInView(sprites, 2, 3, 160, 96);

    it("are those any corner of whose square is in view", () => {
        const inside = at(64, 64);
        const overLeftEdge = at(0, 64);
        const overBottomEdge = at(64, 120);

        expect(inView([inside, overLeftEdge, overBottomEdge])).toEqual([inside, overLeftEdge, overBottomEdge]);
    });

    it("leave out those wholly outside the view", () => {
        expect(inView([at(200, 64), at(64, -10), at(-48, 64)])).toEqual([]);
    });
});
