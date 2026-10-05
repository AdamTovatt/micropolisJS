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

import { CityState } from "../src/cityState";
import {
    MINIMAP_PIXELS_PER_TILE, MinimapImage, drawTile, minimapTile, tileColours, viewRect,
} from "../src/minimap";
import type { StateMessage } from "../src/protocol";
import type { Pixels } from "../src/renderAssets";
import { POWERBIT } from "../src/tileFlags";
import { tileImageOrigin } from "../src/tileSet";
import { DIRT, RIVER, TILE_COUNT } from "../src/tileValues";

// A tile set of 32 by 32 tiles of 16 pixels, each tile's pixels filled by the function from its id and the pixel's
// place in the tile
function tileSet(fill: (tile: number, column: number, row: number) => [number, number, number]) {
    const width = 32 * 16;
    const data = new Uint8ClampedArray(width * width * 4);
    for (let tile = 0; tile < TILE_COUNT; tile++) {
        const origin = tileImageOrigin(tile);
        for (let row = 0; row < 16; row++) {
            for (let column = 0; column < 16; column++) {
                const at = ((origin.y + row) * width + origin.x + column) * 4;
                data.set([...fill(tile, column, row), 255], at);
            }
        }
    }

    return {data, width};
}

describe("the minimap", () => {

    describe("a tile's colour", () => {

        it("is the average of its tile's pixels in the tile set", () => {
            // Half of each tile's columns dark, half light, the light the tile's own shade
            const colours = tileColours(tileSet((tile, column) => column < 8 ? [0, 0, 0] : [200, tile % 200, 100]));

            expect(Array.from(colours.slice(0, 3))).toEqual([100, 0, 50]);
            // Tile 37's green averages 18.5, which rounds up
            expect(Array.from(colours.slice(37 * 3, 38 * 3))).toEqual([100, 19, 50]);
            expect(colours.length).toBe(TILE_COUNT * 3);
        });
    });

    describe("drawing a tile", () => {

        it("fills the tile's square of pixels in its tile id's colour", () => {
            const colours = new Uint8Array(TILE_COUNT * 3);
            colours.set([10, 20, 30], 5 * 3);
            const map = {width: 3, height: 2, getTileValue: (x: number, y: number) => x === 2 && y === 1 ? 5 : 0};
            const pixels = {data: new Uint8ClampedArray(3 * 2 * MINIMAP_PIXELS_PER_TILE ** 2 * 4),
                            width: 3 * MINIMAP_PIXELS_PER_TILE, height: 2 * MINIMAP_PIXELS_PER_TILE};

            drawTile(pixels, colours, map, 2, 1);

            const coloured: string[] = [];
            for (let at = 0; at < pixels.data.length; at += 4) {
                if (pixels.data[at + 3] !== 0) {
                    const pixel = at / 4;
                    coloured.push(`${pixel % pixels.width},${Math.floor(pixel / pixels.width)}:` +
                                  `${Array.from(pixels.data.slice(at, at + 3)).join(" ")}`);
                }
            }

            const square = [];
            for (let row = 0; row < MINIMAP_PIXELS_PER_TILE; row++) {
                for (let column = 0; column < MINIMAP_PIXELS_PER_TILE; column++) {
                    square.push(`${2 * MINIMAP_PIXELS_PER_TILE + column},${MINIMAP_PIXELS_PER_TILE + row}:10 20 30`);
                }
            }
            expect(coloured).toEqual(square);
        });
    });

    describe("its image of the client's copy of the city", () => {

        // River tiles blue and dirt brown, every other tile black
        const colours = new Uint8Array(TILE_COUNT * 3);
        colours.set([0, 0, 255], RIVER * 3);
        colours.set([100, 50, 0], DIRT * 3);

        // A city whose state messages the test delivers, as a source would
        function city() {
            let deliver: (message: StateMessage) => void = () => {};
            const state = new CityState({subscribe: (listener) => {
                deliver = listener;
            }});

            return {state, deliver: (message: StateMessage) => deliver(message)};
        }

        // The colour of the tile at (x, y) in the image, by its top-left pixel
        function colourAt(pixels: Pixels, x: number, y: number): number[] {
            const at = (y * MINIMAP_PIXELS_PER_TILE * pixels.width + x * MINIMAP_PIXELS_PER_TILE) * 4;
            return Array.from(pixels.data.slice(at, at + 3));
        }

        it("draws the whole map, each tile in its id's colour, whatever its flags", () => {
            const {state, deliver} = city();
            deliver({type: "map", width: 2, height: 1, tiles: [RIVER | POWERBIT, DIRT]});

            const pixels = new MinimapImage(state, colours).take()!;

            expect([pixels.width, pixels.height]).toEqual([2 * MINIMAP_PIXELS_PER_TILE, MINIMAP_PIXELS_PER_TILE]);
            expect([colourAt(pixels, 0, 0), colourAt(pixels, 1, 0)]).toEqual([[0, 0, 255], [100, 50, 0]]);
        });

        it("redraws the tiles a tiles message changes, and gives nothing to take while none has", () => {
            const {state, deliver} = city();
            deliver({type: "map", width: 2, height: 1, tiles: [RIVER, DIRT]});
            const image = new MinimapImage(state, colours);
            image.take();
            const unchanged = image.take();

            deliver({type: "tiles", changes: [{x: 1, y: 0, value: RIVER}]});

            const pixels = image.take()!;
            expect([unchanged, colourAt(pixels, 1, 0)]).toEqual([null, [0, 0, 255]]);
        });

        it("redraws the whole map, at its new size, when the city sends a map again", () => {
            const {state, deliver} = city();
            deliver({type: "map", width: 2, height: 1, tiles: [RIVER, DIRT]});
            const image = new MinimapImage(state, colours);
            image.take();

            // As when the player joins the city again after the connection dropped
            deliver({type: "map", width: 1, height: 2, tiles: [DIRT, RIVER]});

            const pixels = image.take()!;
            expect([pixels.width, pixels.height]).toEqual([MINIMAP_PIXELS_PER_TILE, 2 * MINIMAP_PIXELS_PER_TILE]);
            expect([colourAt(pixels, 0, 0), colourAt(pixels, 0, 1)]).toEqual([[100, 50, 0], [0, 0, 255]]);
        });
    });

    describe("the view's rectangle", () => {

        const map = {width: 120, height: 100};

        it("marks the tiles the view shows, a part tile in part", () => {
            expect(viewRect({x: 10, y: 20}, {x: 90.5, y: 56.25}, map))
                .toEqual({left: 10, top: 20, width: 90.5, height: 56.25});
        });

        it("marks no void the view shows beyond the map", () => {
            expect(viewRect({x: -2, y: 90}, {x: 125, y: 56}, map)).toEqual({left: 0, top: 90, width: 120, height: 10});
        });
    });

    describe("the tile under the pointer", () => {

        const map = {width: 120, height: 100};

        it("scales the point from the minimap's size on screen to the map", () => {
            // 140 by 116 2/3 CSS pixels, 7/6 of a pixel a tile
            expect(minimapTile({x: 70, y: 35}, 140, 140 * 100 / 120, map)).toEqual({x: 60, y: 30});
            expect(minimapTile({x: 0, y: 0}, 140, 140 * 100 / 120, map)).toEqual({x: 0, y: 0});
        });

        it("is the nearest tile on the map for a point a drag carries past the minimap's edges", () => {
            expect(minimapTile({x: -20, y: 500}, 140, 140 * 100 / 120, map)).toEqual({x: 0, y: 99});
            expect(minimapTile({x: 140, y: -1}, 140, 140 * 100 / 120, map)).toEqual({x: 119, y: 0});
        });
    });
});
