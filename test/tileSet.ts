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

import { isAcceptableTileImage, tileImageOrigin } from "../src/tileSet";
import { TILE_COUNT } from "../src/tileValues";

// The tileset image is 32 tiles of 16 pixels square
const IMAGE_SIZE = 512;

describe("the tile set", () => {

    describe("finding a tile in the tileset image", () => {

        it("starts the first tile at the image's origin", () => {
            expect(tileImageOrigin(0)).toEqual({x: 0, y: 0});
        });

        it("runs tiles along a row", () => {
            expect(tileImageOrigin(5)).toEqual({x: 80, y: 0});
            expect(tileImageOrigin(31)).toEqual({x: 496, y: 0});
        });

        it("continues on the next row", () => {
            expect(tileImageOrigin(32)).toEqual({x: 0, y: 16});
            expect(tileImageOrigin(33)).toEqual({x: 16, y: 16});
        });

        it("ends the last tile at the image's far corner", () => {
            expect(tileImageOrigin(TILE_COUNT - 1)).toEqual({x: IMAGE_SIZE - 16, y: IMAGE_SIZE - 16});
        });

        it("gives every tile its own square inside the image", () => {
            const seen = new Set<string>();

            for (let tile = 0; tile < TILE_COUNT; tile++) {
                const {x, y} = tileImageOrigin(tile);
                expect(x % 16).toBe(0);
                expect(y % 16).toBe(0);
                expect(x + 16).toBeLessThanOrEqual(IMAGE_SIZE);
                expect(y + 16).toBeLessThanOrEqual(IMAGE_SIZE);
                seen.add(`${x},${y}`);
            }

            expect(seen.size).toBe(TILE_COUNT);
        });
    });

    describe("checking a tileset image", () => {

        it("accepts a square image holding every tile", () => {
            expect(isAcceptableTileImage(IMAGE_SIZE, IMAGE_SIZE)).toBe(true);
        });

        it("rejects an image that isn't square", () => {
            expect(isAcceptableTileImage(IMAGE_SIZE, IMAGE_SIZE / 2)).toBe(false);
            expect(isAcceptableTileImage(IMAGE_SIZE / 2, IMAGE_SIZE)).toBe(false);
        });

        it("rejects a square image of the wrong size", () => {
            expect(isAcceptableTileImage(IMAGE_SIZE / 2, IMAGE_SIZE / 2)).toBe(false);
            expect(isAcceptableTileImage(IMAGE_SIZE * 2, IMAGE_SIZE * 2)).toBe(false);
        });
    });
});
