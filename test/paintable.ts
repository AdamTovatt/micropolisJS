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

import { spriteTiles, spritesInView } from "../src/paintable";
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

describe("the tiles a sprite covers", () => {

    function sprite(width: number): PaintableSprite {
        return {type: 1, frame: 1, x: 76, y: 176, width};
    }

    it("are the tiles under the sprite, relative to the view's origin", () => {
        // The sprite's left edge is 76 - 2 * 16 = 44 pixels into the view, its top 176 - 3 * 16 = 128
        expect(spriteTiles(sprite(48), 2, 3)).toEqual({x: 2, xBound: 6, y: 8, yBound: 11});
    });

    it("run across and down by the sprite's width", () => {
        expect(spriteTiles(sprite(32), 2, 3)).toEqual({x: 2, xBound: 5, y: 8, yBound: 10});
    });

    it("are those of a sprite whose edges sit on tile edges exactly, and no more", () => {
        const onEdges = {...sprite(48), x: 64, y: 64};

        // The sprite runs from pixel 64 to 112 each way: tiles 4 to 6
        expect(spriteTiles(onEdges, 0, 0)).toEqual({x: 4, xBound: 7, y: 4, yBound: 7});
    });
});
