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

import { mouseOutlineLayout } from "../src/gameCanvas";
import type { MouseOutline } from "../src/gameCanvas";

const TILE_WIDTH = 16;
const MAP_WIDTH = 120;
const MAP_HEIGHT = 100;

describe("the game canvas", () => {

    describe("a tool's outline", () => {

        // The layout of a lime outline for a tool of the given size with the mouse over (x, y)
        function outlineAt(x: number, y: number, width: number, height: number, originX = 0, originY = 0,
                           tileWidth = TILE_WIDTH) {
            const tool: MouseOutline = {x, y, width, height, colour: "lime", label: null};
            return mouseOutlineLayout(tool, originX, originY, MAP_WIDTH, MAP_HEIGHT, tileWidth);
        }

        it("is drawn a tile up and left of the mouse for a tool bigger than 2x2", () => {
            expect(outlineAt(10, 5, 3, 3)).toEqual({pos: {x: 144, y: 64}, width: 48, height: 48});
        });

        it("is drawn at the mouse for a smaller tool", () => {
            expect(outlineAt(10, 5, 1, 1)).toEqual({pos: {x: 160, y: 80}, width: 16, height: 16});
        });

        it("is offset and sized by each dimension apart", () => {
            expect(outlineAt(10, 5, 3, 1)).toEqual({pos: {x: 144, y: 80}, width: 48, height: 16});
        });

        it("is drawn at the tile width given", () => {
            expect(outlineAt(10, 5, 3, 3, 0, 0, 64)).toEqual({pos: {x: 576, y: 256}, width: 192, height: 192});
        });

        it("is drawn over a tool partly off the map", () => {
            expect(outlineAt(39, 5, 3, 3, -40, 0)).toEqual({pos: {x: 608, y: 64}, width: 48, height: 48});
        });

        it("isn't drawn off the map's west and north edges", () => {
            expect(outlineAt(5, 5, 1, 1, -40, 0)).toBeNull();
            expect(outlineAt(5, 5, 1, 1, 0, -40)).toBeNull();
        });

        it("isn't drawn off the map's east and south edges", () => {
            expect(outlineAt(20, 20, 1, 1, 100, 0)).toBeNull();
            expect(outlineAt(20, 20, 1, 1, 0, 80)).toBeNull();
        });

        it("draws nothing for a tool of no tiles in either direction", () => {
            expect(outlineAt(10, 5, 0, 1)).toBeNull();
            expect(outlineAt(10, 5, 1, 0)).toBeNull();
        });
    });
});
