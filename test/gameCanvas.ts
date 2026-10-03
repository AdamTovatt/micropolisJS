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

import { PaintRecord, REPAINT, ViewPosition, canvasPointToTile, centredOrigin, forEachTileToPaint, markForRepaint,
         mouseOutlineLayout, spriteDamage, viewport } from "../src/gameCanvas";
import type { MouseOutline, PaintableSprite } from "../src/gameCanvas";

const TILE_WIDTH = 16;
const MAP_WIDTH = 120;
const MAP_HEIGHT = 100;

// The main canvas: 1280 by 900 pixels, which may scroll off the map
const MAIN = viewport(1280, 900, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT, true);

// The tiles painted, as [tile, x, y], in the order painted
function painted(lastPainted: number[] | null, lastWidth: number, lastHeight: number, tiles: number[], width: number,
                 height: number): number[][] {
    const calls: number[][] = [];
    forEachTileToPaint(lastPainted, lastWidth, lastHeight, tiles, width, height,
                       (tile, x, y) => calls.push([tile, x, y]));
    return calls;
}

// The tiles a paint record paints, as [tile, x, y], in the order painted
function recordPaint(record: PaintRecord, tiles: number[], width: number, height: number): number[][] {
    const calls: number[][] = [];
    record.paint(tiles, width, height, (tile, x, y) => calls.push([tile, x, y]));
    return calls;
}

describe("the game canvas", () => {

    describe("its viewport", () => {

        it("counts the whole tiles in view, and the tiles partly in view too", () => {
            expect(MAIN.wholeTilesInViewX).toBe(80);
            expect(MAIN.totalTilesInViewX).toBe(80);
            expect(MAIN.wholeTilesInViewY).toBe(56);
            expect(MAIN.totalTilesInViewY).toBe(57);
        });

        it("lets a view that may scroll off the map show it in at least half the canvas", () => {
            expect(MAIN.minX).toBe(-40);
            expect(MAIN.maxX).toBe(MAP_WIDTH - 1 - 40);
            expect(MAIN.minY).toBe(-28);
            expect(MAIN.maxY).toBe(MAP_HEIGHT - 1 - 28);
        });

        it("keeps a view that may not scroll off the map on it", () => {
            // monsterTV's canvas: 177 by 128 pixels
            const tv = viewport(177, 128, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT, false);

            expect(tv.totalTilesInViewX).toBe(12);
            expect(tv.totalTilesInViewY).toBe(8);
            expect(tv.minX).toBe(0);
            expect(tv.maxX).toBe(MAP_WIDTH - 12);
            expect(tv.minY).toBe(0);
            expect(tv.maxY).toBe(MAP_HEIGHT - 8);
        });

        it("centres the view on a tile", () => {
            // 60 - ceil(80 / 2), 50 - ceil(56 / 2)
            expect(centredOrigin(60, 50, MAIN)).toEqual({x: 20, y: 22});
        });

        it("centres the view on the tile holding a fractional position", () => {
            expect(centredOrigin(60.9, 50.2, MAIN)).toEqual({x: 20, y: 22});
        });

        it("holds the origin within its limits", () => {
            expect(centredOrigin(-100, -100, MAIN)).toEqual({x: MAIN.minX, y: MAIN.minY});
            expect(centredOrigin(500, 500, MAIN)).toEqual({x: MAIN.maxX, y: MAIN.maxY});
        });

        it("puts the origin at the map's corner when the view is bigger than the map and can't scroll off it", () => {
            const huge = viewport(2000, 1700, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT, false);

            expect(huge.maxX).toBeLessThan(huge.minX);
            expect(centredOrigin(60, 50, huge)).toEqual({x: 0, y: 0});
        });
    });

    describe("the view's position", () => {

        it("starts at the origin of the centred view", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);

            expect(position.origin).toEqual({x: 20, y: 22});
        });

        it("moves a tile at a time", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);

            position.moveNorth();
            position.moveEast();
            position.moveEast();

            expect(position.origin).toEqual({x: 22, y: 21});

            position.moveSouth();
            position.moveWest();

            expect(position.origin).toEqual({x: 21, y: 22});
        });

        it("doesn't move past the viewport's limits", () => {
            const position = new ViewPosition(MAIN);

            position.centreOn(-100, -100);
            position.moveNorth();
            position.moveWest();
            expect(position.origin).toEqual({x: MAIN.minX, y: MAIN.minY});

            position.centreOn(500, 500);
            position.moveSouth();
            position.moveEast();
            expect(position.origin).toEqual({x: MAIN.maxX, y: MAIN.maxY});
        });

        it("knows the last tile in view, partly in view included", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);

            expect(position.maxTile).toEqual({x: 20 + 80 - 1, y: 22 + 57 - 1});
        });

        it("keeps its origin when the viewport changes", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);

            position.viewport = viewport(640, 480, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT, true);

            expect(position.origin).toEqual({x: 20, y: 22});
            expect(position.maxTile).toEqual({x: 20 + 40 - 1, y: 22 + 30 - 1});
        });
    });

    describe("finding the tile under a point of the canvas", () => {

        it("counts whole tiles from the view's origin", () => {
            expect(canvasPointToTile(33, 47, {x: 20, y: 22}, TILE_WIDTH, 1280, 900)).toEqual({x: 22, y: 24});
        });

        it("finds no tile past the canvas' right or bottom edge", () => {
            expect(canvasPointToTile(1280, 10, {x: 20, y: 22}, TILE_WIDTH, 1280, 900)).toBeNull();
            expect(canvasPointToTile(10, 900, {x: 20, y: 22}, TILE_WIDTH, 1280, 900)).toBeNull();
        });
    });

    describe("choosing the tiles to paint", () => {

        it("paints every tile on a first paint, in rows", () => {
            expect(painted(null, -1, -1, [1, 2, 3, 4, 5, 6], 3, 2)).toEqual(
                [[1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 0, 1], [5, 1, 1], [6, 2, 1]]);
        });

        it("paints only the tiles that changed", () => {
            expect(painted([1, 2, 3, 4, 5, 6], 3, 2, [1, 2, 3, 4, 9, 6], 3, 2)).toEqual([[9, 1, 1]]);
        });

        it("repaints the tiles marked for repaint", () => {
            expect(painted([1, REPAINT, 3, REPAINT, 5, 6], 3, 2, [1, 2, 3, 4, 5, 6], 3, 2)).toEqual(
                [[2, 1, 0], [4, 0, 1]]);
        });

        it("paints the extra height of a view that grew taller", () => {
            expect(painted([1, 2], 2, 1, [1, 2, 3, 4], 2, 2)).toEqual([[3, 0, 1], [4, 1, 1]]);
        });
    });

    describe("its record of what it painted", () => {

        it("paints every tile the first time", () => {
            expect(recordPaint(new PaintRecord(), [1, 2, 3, 4], 2, 2)).toHaveLength(4);
        });

        it("paints nothing when the tiles are the same", () => {
            const record = new PaintRecord();
            recordPaint(record, [1, 2, 3, 4], 2, 2);

            expect(recordPaint(record, [1, 2, 3, 4], 2, 2)).toEqual([]);
        });

        it("hands out a buffer apart from the tiles it last painted", () => {
            const record = new PaintRecord();
            recordPaint(record, [1, 2, 3, 4], 2, 2);
            recordPaint(record, [1, 2, 3, 4], 2, 2);

            // The next paint's tiles are written into the buffer, which must not overwrite the last paint's
            const next = record.buffer;
            next.splice(0, next.length, 1, 2, 3, 9);

            expect(recordPaint(record, next, 2, 2)).toEqual([[9, 1, 1]]);
        });

        it("repaints an area drawn over since it painted", () => {
            const record = new PaintRecord();
            recordPaint(record, [1, 2, 3, 4, 5, 6], 3, 2);

            record.markForRepaint({x: 1, xBound: 3, y: 1, yBound: 2});

            expect(recordPaint(record, [1, 2, 3, 4, 5, 6], 3, 2)).toEqual([[5, 1, 1], [6, 2, 1]]);
        });

        it("repaints every tile when asked to", () => {
            const record = new PaintRecord();
            recordPaint(record, [1, 2, 3, 4], 2, 2);

            record.repaintAll();

            expect(recordPaint(record, [1, 2, 3, 4], 2, 2)).toHaveLength(4);
        });

        it("paints every tile once it forgets what it painted", () => {
            const record = new PaintRecord();
            recordPaint(record, [1, 2, 3, 4], 2, 2);

            record.forget();

            expect(recordPaint(record, [1, 2, 3, 4], 2, 2)).toHaveLength(4);
        });

        it("ignores marks before its first paint", () => {
            const record = new PaintRecord();

            record.markForRepaint({x: 0, xBound: 2, y: 0, yBound: 2});
            record.repaintAll();

            expect(recordPaint(record, [1, 2, 3, 4], 2, 2)).toHaveLength(4);
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

    describe("marking tiles for repaint", () => {

        it("marks the area's tiles, clipped to the view", () => {
            const lastPainted = new Array(12).fill(0);

            // A view four tiles wide and three high, and an area that runs off its west and south edges
            markForRepaint(lastPainted, {x: -1, xBound: 2, y: 1, yBound: 5}, 4, 3);

            expect(lastPainted).toEqual([0, 0, 0, 0, REPAINT, REPAINT, 0, 0, REPAINT, REPAINT, 0, 0]);
        });

        it("marks nothing for an empty area", () => {
            const lastPainted = new Array(12).fill(0);

            markForRepaint(lastPainted, {x: 2, xBound: 2, y: 1, yBound: 1}, 4, 3);

            expect(lastPainted).toEqual(new Array(12).fill(0));
        });
    });
});
