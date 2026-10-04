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

import {
    ViewPosition, ZOOM_STEPS, canvasPointToTile, centredOrigin, steppedZoom, viewport, zoomedOrigin,
} from "../src/viewPosition";

const TILE_WIDTH = 16;
const MAP_WIDTH = 120;
const MAP_HEIGHT = 100;

// The main canvas: 1280 by 900 pixels, which may scroll off the map
const MAIN = viewport(1280, 900, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT, true);

describe("the view", () => {

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

    describe("its position", () => {

        it("moves its origin to centre on a tile", () => {
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

        it.each(ZOOM_STEPS)("finds each tile of the view under every point of its square at %i pixels a tile",
                            (zoom) => {
            const origin = {x: 20, y: 22};
            const view = viewport(1280, 900, zoom, MAP_WIDTH, MAP_HEIGHT, true);
            const wrong: string[] = [];

            for (let column = 0; column < view.wholeTilesInViewX; column++) {
                for (let row = 0; row < view.wholeTilesInViewY; row++) {
                    // The tile's square on the canvas, from its corner to the pixel before the next tile's
                    for (const [x, y] of [[0, 0], [zoom - 1, 0], [0, zoom - 1], [zoom - 1, zoom - 1], [zoom / 2, 3]]) {
                        const found = canvasPointToTile(column * zoom + x, row * zoom + y, origin, zoom, 1280, 900);
                        if (found?.x !== origin.x + column || found.y !== origin.y + row) {
                            wrong.push(`(${column}, ${row}) at +(${x}, ${y})`);
                        }
                    }
                }
            }

            expect(wrong).toEqual([]);
        });
    });

    describe("zooming", () => {

        it("steps in and out through the zoom steps, held at the ends", () => {
            expect(ZOOM_STEPS[0]).toBe(16);
            expect([steppedZoom(16, 1), steppedZoom(32, 1), steppedZoom(64, 1)]).toEqual([32, 64, 64]);
            expect([steppedZoom(64, -1), steppedZoom(32, -1), steppedZoom(16, -1)]).toEqual([32, 16, 16]);
        });

        it("refuses a zoom that is not a step", () => {
            expect(() => steppedZoom(24, 1)).toThrow("24 is not a zoom step");
        });

        // Every pair of steps, either way, at points across the canvas
        const pairs = ZOOM_STEPS.flatMap((from) => ZOOM_STEPS.filter((to) => to !== from).map((to) => [from, to]));
        const points = [{x: 0, y: 0}, {x: 640, y: 450}, {x: 17, y: 899}, {x: 1279, y: 31}, {x: 333, y: 777}];

        it.each(pairs)("keeps the tile under the pointer under it from %i to %i pixels a tile", (from, to) => {
            const origin = {x: 20, y: 22};
            const after = viewport(1280, 900, to, MAP_WIDTH, MAP_HEIGHT, true);

            for (const point of points) {
                const zoomed = zoomedOrigin(origin, point, from, to, after);

                expect(canvasPointToTile(point.x, point.y, zoomed, to, 1280, 900))
                    .toEqual(canvasPointToTile(point.x, point.y, origin, from, 1280, 900));
            }
        });

        it("keeps the origin on whole tiles", () => {
            const zoomed = zoomedOrigin({x: 20, y: 22}, {x: 333, y: 777}, 16, 64,
                                        viewport(1280, 900, 64, MAP_WIDTH, MAP_HEIGHT, true));

            expect([Number.isInteger(zoomed.x), Number.isInteger(zoomed.y)]).toEqual([true, true]);
        });

        it("holds the origin within the new viewport's limits", () => {
            // Zoomed out from the map's top-left corner, the tile under the pointer would need an origin past the limits
            const out = viewport(1280, 900, 16, MAP_WIDTH, MAP_HEIGHT, true);
            const zoomed = zoomedOrigin({x: -10, y: -7}, {x: 1279, y: 899}, 64, 16, out);

            expect(zoomed).toEqual({x: out.minX, y: out.minY});
        });

        it("moves the view's position to the zoomed origin and viewport", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);
            expect(position.origin).toEqual({x: 20, y: 22});
            const after = viewport(1280, 900, 32, MAP_WIDTH, MAP_HEIGHT, true);

            position.zoom(after, {x: 640, y: 450}, 16, 32);

            // The tile under (640, 450) is (20 + 40, 22 + 28): at 32 pixels a tile it is 20 and 14 tiles in
            expect(position.viewport).toBe(after);
            expect(position.origin).toEqual({x: 40, y: 36});
        });
    });
});
