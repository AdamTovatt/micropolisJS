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

// The main canvas: 1280 by 900 pixels
const MAIN = viewport(1280, 900, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT);

describe("the view", () => {

    describe("its viewport", () => {

        it("counts the whole tiles in view, and the tiles partly in view too", () => {
            expect(MAIN.wholeTilesInViewX).toBe(80);
            expect(MAIN.totalTilesInViewX).toBe(80);
            expect(MAIN.wholeTilesInViewY).toBe(56);
            expect(MAIN.totalTilesInViewY).toBe(57);
        });

        it("stops the view at the map's edges, with the last whole tiles in view the map's last", () => {
            expect(MAIN.minX).toBe(0);
            expect(MAIN.maxX).toBe(MAP_WIDTH - 80);
            expect(MAIN.minY).toBe(0);
            expect(MAIN.maxY).toBe(MAP_HEIGHT - 56);
        });

        it("leaves less than a tile of void past the map's far edges, where a tile shows in part", () => {
            // monsterTV's canvas: 177 by 128 pixels, 11 and a sixteenth tiles across
            const tv = viewport(177, 128, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT);

            expect(tv.totalTilesInViewX).toBe(12);
            expect(tv.totalTilesInViewY).toBe(8);
            expect(tv.minX).toBe(0);
            expect(tv.maxX).toBe(MAP_WIDTH - 11);
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

        it("centres the map along an axis the view is longer than the map on, leaving the origin no room", () => {
            // 125 tiles across and 106 and a quarter down: 5 tiles of void across, split, and 6 and a quarter down
            const huge = viewport(2000, 1700, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT);

            expect(huge).toMatchObject({minX: -2, maxX: -2, minY: -3, maxY: -3});
            expect(centredOrigin(0, 0, huge)).toEqual({x: -2, y: -3});
            expect(centredOrigin(119, 99, huge)).toEqual({x: -2, y: -3});
        });

        it("centres along one axis and scrolls along the other", () => {
            const wide = viewport(2000, 900, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT);

            expect(wide).toMatchObject({minX: -2, maxX: -2, minY: 0, maxY: MAP_HEIGHT - 56});
        });

        it("lets a view exactly the map's size show it all from its corner", () => {
            const exact = viewport(MAP_WIDTH * TILE_WIDTH, MAP_HEIGHT * TILE_WIDTH, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT);

            expect(exact).toMatchObject({minX: 0, maxX: 0, minY: 0, maxY: 0});
        });
    });

    describe("its position", () => {

        it("moves its origin to centre on a tile", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);

            expect(position.origin).toEqual({x: 20, y: 22});
        });

        it("scrolls by whole tiles across and down", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);

            position.scrollBy(2, -1);
            expect(position.origin).toEqual({x: 22, y: 21});

            position.scrollBy(-1, 1);
            expect(position.origin).toEqual({x: 21, y: 22});
        });

        it("doesn't scroll past the viewport's limits", () => {
            const position = new ViewPosition(MAIN);

            position.centreOn(-100, -100);
            position.scrollBy(-1, -1);
            expect(position.origin).toEqual({x: MAIN.minX, y: MAIN.minY});

            position.centreOn(500, 500);
            position.scrollBy(1, 1);
            expect(position.origin).toEqual({x: MAIN.maxX, y: MAIN.maxY});

            // A scroll past one limit still moves along the other axis
            position.scrollBy(-3, 7);
            expect(position.origin).toEqual({x: MAIN.maxX - 3, y: MAIN.maxY});
        });

        it("knows the last tile in view, partly in view included", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);

            expect(position.maxTile).toEqual({x: 20 + 80 - 1, y: 22 + 57 - 1});
        });

        it("keeps its origin when the viewport changes", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);

            position.viewport = viewport(640, 480, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT);

            expect(position.origin).toEqual({x: 20, y: 22});
            expect(position.maxTile).toEqual({x: 20 + 40 - 1, y: 22 + 30 - 1});
        });

        it("holds its origin within the new limits when the viewport grows", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(500, 500);

            // 100 tiles across and 75 down at 1600 by 1200 pixels
            position.viewport = viewport(1600, 1200, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT);

            expect(position.origin).toEqual({x: MAP_WIDTH - 100, y: MAP_HEIGHT - 75});
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
            const view = viewport(1280, 900, zoom, MAP_WIDTH, MAP_HEIGHT);
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
            // On a map big enough that no zoom here reaches its edges, where the limits would hold the origin
            const origin = {x: 200, y: 200};
            const after = viewport(1280, 900, to, 400, 400);

            for (const point of points) {
                const zoomed = zoomedOrigin(origin, point, from, to, after);

                expect(canvasPointToTile(point.x, point.y, zoomed, to, 1280, 900))
                    .toEqual(canvasPointToTile(point.x, point.y, origin, from, 1280, 900));
            }
        });

        it("holds the origin within the new viewport's limits", () => {
            // Zoomed out from the map's top-left corner, the tile under the pointer would need an origin past the limits
            const out = viewport(1280, 900, 16, MAP_WIDTH, MAP_HEIGHT);
            const zoomed = zoomedOrigin({x: -10, y: -7}, {x: 1279, y: 899}, 64, 16, out);

            expect(zoomed).toEqual({x: out.minX, y: out.minY});
        });

        it("moves the view's position to the zoomed origin and viewport", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);
            expect(position.origin).toEqual({x: 20, y: 22});
            const after = viewport(1280, 900, 32, MAP_WIDTH, MAP_HEIGHT);

            position.zoom(after, {x: 640, y: 450}, 16, 32);

            // The tile under (640, 450) is (20 + 40, 22 + 28): at 32 pixels a tile it is 20 and 14 tiles in
            expect(position.viewport).toBe(after);
            expect(position.origin).toEqual({x: 40, y: 36});
        });
    });
});
