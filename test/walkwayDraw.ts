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
    DIRT, FOUNTAIN, HBRDG0, HRAILROAD, HTRFBASE, INTERSECTION, LHRAIL, LVRAIL10, ROADS, ROADS2, ROADS3, VRAILROAD,
    WOODS2,
} from "../src/tileValues";
import { WINDOW, carriageway, isPaved, walkwaysAround } from "../src/walkwayDraw";
import { walkwayOf } from "./helpers/walkways";

const path = (...ninths: number[]) => walkwayOf(ninths);

// The window's bits of the ninths given, wx across and wy down from its top-left
function bits(...ninths: [number, number][]): number {
    return ninths.reduce((all, [wx, wy]) => all | (1 << (wy * WINDOW + wx)), 0);
}

// The ninths of a tile, a bit 1 << n for each
function ninthsOf(...ninths: number[]): number {
    return ninths.reduce((all, n) => all | (1 << n), 0);
}

describe("the walkway a tile's paths are drawn from", () => {

    // A 3 by 3 grid of tiles, the middle one's walkway and its neighbours' as given
    function grid(walkways: Record<number, number>): {width: number, height: number, walkways: number[]} {
        return {width: 3, height: 3, walkways: Array.from({length: 9}, (_, i) => walkways[i] ?? 0)};
    }

    it("holds the tile's own ninths in the window's middle three by three", () => {
        expect(walkwaysAround(grid({4: path(0, 4, 8)}), 1, 1)).toBe(bits([1, 1], [2, 2], [3, 3]));
    });

    it("holds the ninths of the tiles beside it that touch its own, and none farther in", () => {
        // East: ninths 3 and 4 of the tile east, of which only 3 touches; south: ninth 1 of the tile south, which does,
        // and ninth 4, which doesn't; north-west: ninth 8, its corner, which touches the tile's corner
        const around = walkwaysAround(grid({5: path(3, 4), 7: path(1, 4), 0: path(8)}), 1, 1);

        expect(around).toBe(bits([4, 2], [2, 4], [0, 0]));
    });

    it("holds none past the grid's edge", () => {
        expect(walkwaysAround(grid({0: path(0, 1, 2, 3)}), 0, 0)).toBe(bits([1, 1], [2, 1], [3, 1], [1, 2]));
    });
});

describe("a path's look", () => {

    it.each([[ROADS, true], [HTRFBASE + 2, true], [LHRAIL, true], [LVRAIL10, true], [HBRDG0, true],
             [DIRT, false], [WOODS2, false], [FOUNTAIN, false]])("on tile %i is paving: %s", (id, paved) => {
        expect(isPaved(id)).toBe(paved);
    });
});

describe("a road's carriageway", () => {

    it.each([
        ["a road across", ROADS, ninthsOf(3, 4, 5)],
        ["a road down", ROADS2, ninthsOf(1, 4, 7)],
        ["traffic across, as the road it runs on", HTRFBASE + 2, ninthsOf(3, 4, 5)],
        ["a bend north and east", ROADS3, ninthsOf(1, 4, 5)],
        ["a crossroads", INTERSECTION, ninthsOf(1, 3, 4, 5, 7)],
        ["a road down across rail", HRAILROAD, ninthsOf(1, 4, 7)],
        ["a road across over rail", VRAILROAD, ninthsOf(3, 4, 5)],
        ["rail alone", LHRAIL, 0],
        ["bare land", DIRT, 0],
    ])("is %s's middle and the sides it leaves by", (_, id, ninths) => {
        expect(carriageway(id)).toBe(ninths);
    });
});
