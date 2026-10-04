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

import type { PaintableSprite } from "../src/paintable";
import { mustRepaintAll, spriteDamage } from "../src/tileCanvas";

const TILE_WIDTH = 16;

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

    describe("a sprite's damage", () => {

        function sprite(width: number): PaintableSprite {
            return {type: 1, frame: 1, x: 76, y: 176, width};
        }

        it("covers the tiles under the sprite, relative to the view's origin", () => {
            // The sprite's left edge is 76 - 2 * 16 = 44 pixels into the view, its top 176 - 3 * 16 = 128
            expect(spriteDamage(sprite(48), 2, 3, TILE_WIDTH)).toEqual({x: 2, xBound: 6, y: 8, yBound: 11});
        });

        it("runs across and down by the sprite's width", () => {
            expect(spriteDamage(sprite(32), 2, 3, TILE_WIDTH)).toEqual({x: 2, xBound: 5, y: 8, yBound: 10});
        });

        it("covers a sprite whose edges sit on tile edges exactly", () => {
            const onEdges = {...sprite(48), x: 64, y: 64};

            // The sprite runs from pixel 64 to 112 each way: tiles 4 to 6
            expect(spriteDamage(onEdges, 0, 0, TILE_WIDTH)).toEqual({x: 4, xBound: 7, y: 4, yBound: 7});
        });
    });
});
