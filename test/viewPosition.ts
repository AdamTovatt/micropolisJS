/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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
    ViewPosition, ZOOM_STEPS, centredOrigin, drawnOrigin, steppedZoom, tileOnCanvasUnderPoint,
    tileUnderPoint, viewport, zoomedOrigin,
} from "../src/viewPosition";

const TILE_WIDTH = 16;
const MAP_WIDTH = 120;
const MAP_HEIGHT = 100;

// The main canvas: 1280 by 900 pixels, 80 tiles across and 56 and a quarter down
const MAIN = viewport(1280, 900, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT);

// A position of the main canvas's view at the origin given, which a pan puts there
function positionAt(x: number, y: number): ViewPosition {
    const position = new ViewPosition(MAIN);
    position.grab({x: 0, y: 0}, TILE_WIDTH);
    position.pan({x: -x * TILE_WIDTH, y: -y * TILE_WIDTH});
    position.release();
    expect(position.origin).toEqual({x, y});
    return position;
}

describe("the view", () => {

    describe("its viewport", () => {

        it("counts the tiles in view, a tile shown in part as its part, and the whole tiles in view", () => {
            expect(MAIN).toMatchObject({tilesInViewX: 80, tilesInViewY: 56.25, wholeTilesInViewX: 80,
                                        wholeTilesInViewY: 56});
        });

        it("stops the view where the middle of an edge tile is at the middle of the view", () => {
            // Half a tile less half of 80 tiles and of 56 and a quarter, from either end of the map
            expect(MAIN).toMatchObject({minX: -39.5, maxX: MAP_WIDTH - 40.5, minY: -27.625, maxY: MAP_HEIGHT - 28.625});
        });

        it("lets the origin stop between tiles when the view shows part of a tile", () => {
            // monsterTV's canvas: 177 by 128 pixels, 11 and a sixteenth tiles across
            const tv = viewport(177, 128, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT);

            expect(tv).toMatchObject({minX: -5.03125, maxX: MAP_WIDTH - 6.03125, minY: -3.5, maxY: MAP_HEIGHT - 4.5});
        });

        // Beyond the two views above, whose limits are pinned in numbers: one longer than the map, and one its size
        it.each([[2000, 1700], [MAP_WIDTH * TILE_WIDTH, MAP_HEIGHT * TILE_WIDTH]])(
            "puts the middle of each corner tile at the middle of a %i by %i view at its limits", (width, height) => {
            const view = viewport(width, height, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT);
            const middle = (x: number, y: number) => ({x: x + view.tilesInViewX / 2, y: y + view.tilesInViewY / 2});

            expect([middle(view.minX, view.minY), middle(view.maxX, view.maxY)])
                .toEqual([{x: 0.5, y: 0.5}, {x: MAP_WIDTH - 0.5, y: MAP_HEIGHT - 0.5}]);
        });

        it("centres the view on a tile, from a whole tile", () => {
            // 60 - ceil(80 / 2), 50 - ceil(56 / 2)
            expect(centredOrigin(60, 50, MAIN)).toEqual({x: 20, y: 22});
        });

        it("centres the view on the tile holding a fractional position", () => {
            expect(centredOrigin(60.9, 50.2, MAIN)).toEqual({x: 20, y: 22});
        });

        it("centres the view on a tile near the map's edges as it does on one in the middle", () => {
            // 1 - ceil(80 / 2), 2 - ceil(56 / 2); 118 - 40, 98 - 28
            expect(centredOrigin(1, 2, MAIN)).toEqual({x: -39, y: -26});
            expect(centredOrigin(118, 98, MAIN)).toEqual({x: 78, y: 70});
        });

        it("holds the origin within its limits", () => {
            expect(centredOrigin(-100, -100, MAIN)).toEqual({x: MAIN.minX, y: MAIN.minY});
            expect(centredOrigin(500, 500, MAIN)).toEqual({x: MAIN.maxX, y: MAIN.maxY});
            // 0 - 40 and 0 - 28 are past the limits, which put the corner tile's middle at the view's
            expect(centredOrigin(0, 0, MAIN)).toEqual({x: -39.5, y: -27.625});
        });

        it("holds a map shorter than the view to the same rule, which leaves the origin room to move", () => {
            // 125 tiles across and 106 and a quarter down
            const huge = viewport(2000, 1700, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT);

            expect(huge).toMatchObject({minX: -62, maxX: MAP_WIDTH - 63, minY: -52.625, maxY: MAP_HEIGHT - 53.625});
            // 0 - ceil(125 / 2) and 0 - ceil(106 / 2) are past the limits
            expect(centredOrigin(0, 0, huge)).toEqual({x: -62, y: -52.625});
            // 119 - ceil(125 / 2), 99 - ceil(106 / 2)
            expect(centredOrigin(119, 99, huge)).toEqual({x: 56, y: 46});
        });
    });

    describe("its position", () => {

        it("moves its origin to centre on a tile", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);

            expect(position.origin).toEqual({x: 20, y: 22});
        });

        it("scrolls by the tiles given across and down, a fraction of a tile included, with no rounding", () => {
            const position = positionAt(20.25, 22.5);

            position.scrollBy(1.375, -0.0625);
            expect(position.origin).toEqual({x: 21.625, y: 22.4375});

            position.scrollBy(-2, 0.5);
            expect(position.origin).toEqual({x: 19.625, y: 22.9375});
        });

        it("doesn't scroll past the viewport's limits, and stops exactly on them", () => {
            const position = new ViewPosition(MAIN);

            position.centreOn(-100, -100);
            position.scrollBy(-1, -1);
            expect(position.origin).toEqual({x: MAIN.minX, y: MAIN.minY});

            position.centreOn(500, 500);
            position.scrollBy(1, 1);
            expect(position.origin).toEqual({x: MAIN.maxX, y: MAIN.maxY});

            // A scroll past one limit still moves along the other axis: 79.5 back 3 and 71.375 back 1.25
            position.scrollBy(-3, -1.25);
            expect(position.origin).toEqual({x: 76.5, y: 70.125});

            position.scrollBy(0, 2);
            expect(position.origin).toEqual({x: 76.5, y: 71.375});
        });

        it("knows the last tile in view, partly in view included", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);

            expect(position.maxTile).toEqual({x: 20 + 80 - 1, y: 22 + 57 - 1});
            expect(positionAt(20.5, 22).maxTile).toEqual({x: 20 + 81 - 1, y: 22 + 57 - 1});
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

            // 100 tiles across and 75 down at 1600 by 1200 pixels, the last tile's middle at the middle of the view
            position.viewport = viewport(1600, 1200, TILE_WIDTH, MAP_WIDTH, MAP_HEIGHT);

            expect(position.origin).toEqual({x: MAP_WIDTH - 0.5 - 50, y: MAP_HEIGHT - 0.5 - 37.5});
        });
    });

    describe("panning", () => {

        const grabs = [{x: 640, y: 450}, {x: 3, y: 897}, {x: 1001, y: 17}];
        const drags = [{x: 1, y: 0}, {x: -37, y: 13}, {x: 250, y: -301}, {x: -5, y: -5}];

        it.each(ZOOM_STEPS)("keeps the point of the map grabbed under the pointer at %i pixels a tile", (zoom) => {
            // On a map big enough that no pan here reaches its edges
            const view = viewport(1280, 900, zoom, 400, 400);
            const wrong: string[] = [];

            for (const grab of grabs) {
                for (const drag of drags) {
                    const position = new ViewPosition(view);
                    position.centreOn(200, 200);
                    const before = position.origin;
                    const to = {x: grab.x + drag.x, y: grab.y + drag.y};

                    position.grab(grab, zoom);
                    position.pan(to);

                    // The map point under the pointer, in tiles, and the tile drawn under it, at either pixel ratio
                    const held = position.origin.x + to.x / zoom === before.x + grab.x / zoom &&
                                 position.origin.y + to.y / zoom === before.y + grab.y / zoom;
                    const sameTile = [1, 2].every((ratio) => {
                        const after = tileUnderPoint(to.x, to.y, position.origin, zoom, ratio);
                        const grabbed = tileUnderPoint(grab.x, grab.y, before, zoom, ratio);
                        return after.x === grabbed.x && after.y === grabbed.y;
                    });
                    if (!held || !sameTile) {
                        wrong.push(`grabbed at (${grab.x}, ${grab.y}), dragged by (${drag.x}, ${drag.y})`);
                    }
                }
            }

            expect(wrong).toEqual([]);
        });

        it("doesn't round the origin to whole tiles", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);
            position.grab({x: 100, y: 100}, TILE_WIDTH);
            position.pan({x: 92, y: 104});

            expect(position.origin).toEqual({x: 20.5, y: 21.75});
        });

        it("stops at the view's limits, and picks up again as the pointer comes back", () => {
            const position = positionAt(-39, 70);
            position.grab({x: 640, y: 450}, TILE_WIDTH);

            // Past the left and bottom limits, -39.5 and 71.375, by 3.25 tiles and 1.125
            position.pan({x: 700, y: 410});
            expect(position.origin).toEqual({x: MAIN.minX, y: MAIN.maxY});

            // Back to where the pointer grabbed the map, and a quarter tile on
            position.pan({x: 640, y: 450});
            expect(position.origin).toEqual({x: -39, y: 70});
            position.pan({x: 636, y: 454});
            expect(position.origin).toEqual({x: -38.75, y: 69.75});
        });

        it("moves nothing once it lets go of the map", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);
            position.grab({x: 100, y: 100}, TILE_WIDTH);
            position.release();
            position.pan({x: 0, y: 0});

            expect(position.origin).toEqual({x: 20, y: 22});
        });
    });

    describe("finding the tile under a point of the canvas", () => {

        it("counts whole tiles from the view's origin", () => {
            expect(tileOnCanvasUnderPoint(33, 47, {x: 20, y: 22}, TILE_WIDTH, 1, 1280, 900)).toEqual({x: 22, y: 24});
        });

        it("finds no tile past the canvas' right or bottom edge", () => {
            expect(tileOnCanvasUnderPoint(1280, 10, {x: 20, y: 22}, TILE_WIDTH, 1, 1280, 900)).toBeNull();
            expect(tileOnCanvasUnderPoint(10, 900, {x: 20, y: 22}, TILE_WIDTH, 1, 1280, 900)).toBeNull();
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
                        const found = tileOnCanvasUnderPoint(column * zoom + x, row * zoom + y, origin, zoom, 1, 1280,
                                                             900);
                        if (found?.x !== origin.x + column || found.y !== origin.y + row) {
                            wrong.push(`(${column}, ${row}) at +(${x}, ${y})`);
                        }
                    }
                }
            }

            expect(wrong).toEqual([]);
        });

        it("finds the tiles of a view from an origin between tiles, as far into the first as the origin lies", () => {
            // 20.25 and 22.5 tiles are 324 and 360 pixels: the first tile shows its last 12 pixels across and 8 down
            const origin = {x: 20.25, y: 22.5};

            expect(tileUnderPoint(0, 0, origin, TILE_WIDTH, 1)).toEqual({x: 20, y: 22});
            expect(tileUnderPoint(11.9, 7.9, origin, TILE_WIDTH, 1)).toEqual({x: 20, y: 22});
            expect(tileUnderPoint(12, 8, origin, TILE_WIDTH, 1)).toEqual({x: 21, y: 23});
            // At 1.5 device pixels to the CSS pixel the same: 486 and 540 of 24 device pixels a tile
            expect(tileUnderPoint(11.9, 7.9, origin, TILE_WIDTH, 1.5)).toEqual({x: 20, y: 22});
            expect(tileUnderPoint(12, 8, origin, TILE_WIDTH, 1.5)).toEqual({x: 21, y: 23});
        });

        it("finds the tile drawn under a point, the origin snapped to whole device pixels as the map is drawn", () => {
            // 20.97 tiles are 335.52 pixels at 16 a tile, which the map is drawn from as 336, tile 21's left edge
            expect(drawnOrigin({x: 20.97, y: 22}, TILE_WIDTH)).toEqual({x: 336, y: 352});
            expect(tileUnderPoint(0, 0, {x: 20.97, y: 22}, TILE_WIDTH, 1)).toEqual({x: 21, y: 22});
            // At 2 device pixels to the CSS pixel it is drawn from 671, a pixel into tile 20's last
            expect(drawnOrigin({x: 20.97, y: 22}, 2 * TILE_WIDTH)).toEqual({x: 671, y: 704});
            expect(tileUnderPoint(0, 0, {x: 20.97, y: 22}, TILE_WIDTH, 2)).toEqual({x: 20, y: 22});
            expect(tileUnderPoint(0.5, 0, {x: 20.97, y: 22}, TILE_WIDTH, 2)).toEqual({x: 21, y: 22});
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

        it.each(pairs)("keeps the point of the map under the pointer under it from %i to %i pixels a tile",
                       (from, to) => {
            // On a map big enough that no zoom here reaches its edges, where the limits would hold the origin
            const origin = {x: 200.25, y: 199.5};
            const after = viewport(1280, 900, to, 400, 400);

            for (const point of points) {
                const zoomed = zoomedOrigin(origin, point, from, to, after);

                // Exactly, in tiles; the tile drawn under it may differ where the point lies within half a device pixel
                // of a tile's edge, as the map is drawn from the origin snapped to whole device pixels
                expect({x: zoomed.x + point.x / to, y: zoomed.y + point.y / to})
                    .toEqual({x: origin.x + point.x / from, y: origin.y + point.y / from});
            }
        });

        it("holds the origin within the new viewport's limits", () => {
            // From within the limits at 64 pixels a tile, about (-9.5, -6.53), zoomed out over the view's bottom-right
            // corner, keeping the tile under the pointer would need an origin of about (-69, -48), past the limits
            const before = viewport(1280, 900, 64, MAP_WIDTH, MAP_HEIGHT);
            const start = {x: -9, y: -6};
            expect(start.x >= before.minX && start.y >= before.minY).toBe(true);
            const out = viewport(1280, 900, 16, MAP_WIDTH, MAP_HEIGHT);
            const zoomed = zoomedOrigin(start, {x: 1279, y: 899}, 64, 16, out);

            expect(zoomed).toEqual({x: out.minX, y: out.minY});
        });

        it("moves the view's position to the zoomed origin and viewport, without rounding it to whole tiles", () => {
            const position = new ViewPosition(MAIN);
            position.centreOn(60, 50);
            expect(position.origin).toEqual({x: 20, y: 22});
            const after = viewport(1280, 900, 32, MAP_WIDTH, MAP_HEIGHT);

            position.zoom(after, {x: 640, y: 450}, 16, 32);

            // The point under (640, 450) is (20 + 40, 22 + 28.125): at 32 pixels a tile it is 20 and 14.0625 tiles in
            expect(position.viewport).toBe(after);
            expect(position.origin).toEqual({x: 40, y: 36.0625});
        });
    });
});
