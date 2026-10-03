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

import { mouseOutlineLayout, mustRepaintAll, spriteDamage } from "../src/gameCanvas";
import type { MouseOutline, PaintableSprite } from "../src/gameCanvas";

const TILE_WIDTH = 16;
const MAP_WIDTH = 120;
const MAP_HEIGHT = 100;

describe("the game canvas", () => {

    describe("deciding to repaint every tile", () => {

        it("repaints only what changed while the canvas keeps its size and tileset", () => {
            expect(mustRepaintAll(false, 1280, 900, 1280, 900)).toBe(false);
        });

        it("repaints every tile when the tileset changes", () => {
            expect(mustRepaintAll(true, 1280, 900, 1280, 900)).toBe(true);
        });

        it("repaints every tile when the canvas changes width or height", () => {
            expect(mustRepaintAll(false, 1440, 900, 1280, 900)).toBe(true);
            expect(mustRepaintAll(false, 1280, 800, 1280, 900)).toBe(true);
        });
    });

    describe("a sprite's damage", () => {

        function sprite(width: number, height: number): PaintableSprite {
            return {type: 1, frame: 1, x: 100, y: 200, xOffset: -24, yOffset: -24, width, height};
        }

        it("covers the tiles under the sprite, relative to the view's origin", () => {
            // The sprite's left edge is 100 - 24 - 2 * 16 = 44 pixels into the view, its top 200 - 24 - 3 * 16 = 128
            expect(spriteDamage(sprite(48, 48), 2, 3, TILE_WIDTH)).toEqual({x: 2, xBound: 6, y: 8, yBound: 11});
        });

        it("runs down by the sprite's height", () => {
            expect(spriteDamage(sprite(48, 32), 2, 3, TILE_WIDTH)).toEqual({x: 2, xBound: 6, y: 8, yBound: 10});
        });

        it("covers a sprite whose edges sit on tile edges exactly", () => {
            const onEdges = {...sprite(48, 48), x: 88, y: 88};

            // The sprite runs from pixel 64 to 112 each way: tiles 4 to 6
            expect(spriteDamage(onEdges, 0, 0, TILE_WIDTH)).toEqual({x: 4, xBound: 7, y: 4, yBound: 7});
        });
    });

    describe("a tool's outline", () => {

        // The layout of a lime outline for a tool of the given size with the mouse over (x, y)
        function outlineAt(x: number, y: number, width: number, height: number, originX = 0, originY = 0) {
            const tool: MouseOutline = {x, y, width, height, colour: "lime"};
            return mouseOutlineLayout(tool, originX, originY, MAP_WIDTH, MAP_HEIGHT, TILE_WIDTH);
        }

        it("is drawn a tile up and left of the mouse for a tool bigger than 2x2, and damages a tile either side", () => {
            expect(outlineAt(10, 5, 3, 3)).toEqual({
                box: {pos: {x: 144, y: 64}, width: 48, height: 48},
                damage: {x: 8, xBound: 14, y: 3, yBound: 9},
            });
        });

        it("is drawn at the mouse for a smaller tool", () => {
            expect(outlineAt(10, 5, 1, 1)).toEqual({
                box: {pos: {x: 160, y: 80}, width: 16, height: 16},
                damage: {x: 9, xBound: 13, y: 4, yBound: 8},
            });
        });

        it("is offset, sized and damages by each dimension apart", () => {
            expect(outlineAt(10, 5, 3, 1)).toEqual({
                box: {pos: {x: 144, y: 80}, width: 48, height: 16},
                damage: {x: 8, xBound: 14, y: 4, yBound: 8},
            });
        });

        it("is drawn over a tool partly off the map", () => {
            expect(outlineAt(39, 5, 3, 3, -40, 0)).toEqual({
                box: {pos: {x: 608, y: 64}, width: 48, height: 48},
                damage: {x: 37, xBound: 43, y: 3, yBound: 9},
            });
        });

        it("isn't drawn, and damages nothing, off the map's west edge", () => {
            expect(outlineAt(5, 5, 1, 1, -40, 0)).toEqual({box: null, damage: {x: 5, xBound: 5, y: 5, yBound: 5}});
        });

        it("isn't drawn off the map's north edge", () => {
            expect(outlineAt(5, 5, 1, 1, 0, -40)?.box).toBeNull();
        });

        it("isn't drawn off the map's east and south edges", () => {
            expect(outlineAt(20, 20, 1, 1, 100, 0)?.box).toBeNull();
            expect(outlineAt(20, 20, 1, 1, 0, 80)?.box).toBeNull();
        });

        it("draws nothing for a tool of no tiles in either direction", () => {
            expect(outlineAt(10, 5, 0, 1)).toBeNull();
            expect(outlineAt(10, 5, 1, 0)).toBeNull();
        });
    });
});
