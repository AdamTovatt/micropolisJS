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

import { BlockMap, isFire, isRoad, normalizeRoad } from "../e2e/savedMap";
import {
    BRWH, BRWXXX7, DIRT, FIRE, HBRIDGE, HPOWER, HTRFBASE, LASTFIRE, LASTROAD, LTRFBASE, ROADS, ROADS2, UNUSED_TRASH5,
    VROADPOWER,
} from "../src/tileValues";

// The traffic tiles come in frames of the sixteen road tiles from HBRIDGE: four frames of light traffic from LTRFBASE,
// then four of heavy traffic from HTRFBASE
const FRAME = 16;

describe("a burning tile", () => {

    it.each([FIRE, LASTFIRE])("is the fire tile %d", (id) => {
        expect(isFire(id)).toBe(true);
    });

    it.each([UNUSED_TRASH5, HBRIDGE])("is not the tile %d, beside the fire tiles", (id) => {
        expect(isFire(id)).toBe(false);
    });
});

describe("a road tile", () => {

    it.each([HBRIDGE, ROADS, LTRFBASE, LASTROAD, BRWXXX7])("is the road tile %d", (id) => {
        expect(isRoad(id)).toBe(true);
    });

    it.each([LASTFIRE, HPOWER])("is not the tile %d, beside the road tiles", (id) => {
        expect(isRoad(id)).toBe(false);
    });
});

describe("a road without its traffic", () => {

    it.each([
        ["a plain road along a row", ROADS, ROADS],
        ["a plain road down a column", ROADS2, ROADS2],
        ["a road along a row in light traffic's first frame", LTRFBASE + 2, ROADS],
        ["a road down a column in light traffic's second frame", LTRFBASE + FRAME + 3, ROADS2],
        ["a road along a row in heavy traffic's last frame", HTRFBASE + 3 * FRAME + 2, ROADS],
        ["the last road tile, a road under a power line down a column in heavy traffic", LASTROAD, VROADPOWER],
        ["the tile after it, a bridge in heavy traffic", BRWXXX7, BRWH],
    ])("is the road it is for %s", (_, id, road) => {
        expect(normalizeRoad(id)).toBe(road);
    });

    it.each([DIRT, LASTFIRE, HPOWER])("is the tile itself for the tile %d, which is no road", (id) => {
        expect(normalizeRoad(id)).toBe(id);
    });
});

describe("a block map", () => {

    // A map of ten tiles by five in blocks of four tiles a side: three blocks a row, the last two tiles wide, and two
    // rows, the last a tile high
    const values = [1, 2, 3, 4, 5, 6];

    it("has a block for the tiles left over at the right and bottom edges", () => {
        const map = new BlockMap(10, 5, 4, values);

        expect([map.width, map.height]).toEqual([3, 2]);
        expect([map.worldGet(8, 0), map.worldGet(9, 3), map.worldGet(0, 4), map.worldGet(9, 4)]).toEqual([3, 3, 4, 6]);
    });

    it.each([
        ["too few values", values.slice(1)],
        ["too many values", [...values, 7]],
    ])("refuses %s for its blocks", (_, wrong) => {
        expect(() => new BlockMap(10, 5, 4, wrong)).toThrow(`A 3x2 block map has 6 values, got ${wrong.length}`);
    });
});
