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
    DIRT, FOUNTAIN, HBRDG0, HRAILROAD, HTRFBASE, LHRAIL, LVRAIL, LVRAIL10, ROADS, ROADS2, WOODS2,
} from "../src/tileValues";
import {
    PART_BITS, WINDOW, decksAround, isPaved, pathParts, underAround, underWay, walkwaysAround,
} from "../src/walkwayDraw";
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

describe("the parts of a tile its paths are drawn over", () => {

    // A part of a tile, x and y ninths from its top-left, width by height ninths, as pathParts packs it
    function part(x: number, y: number, width: number, height: number): number {
        return x | (y << PART_BITS) | (width << 2 * PART_BITS) | (height << 3 * PART_BITS);
    }

    it("draws over the ninths holding walkway alone", () => {
        expect(pathParts(bits([2, 2]), 0)).toEqual([part(1, 1, 1, 1)]);
    });

    it("draws over none where a straight path beside the tile touches it", () => {
        expect(pathParts(bits([4, 1], [4, 2], [4, 3]), 0)).toEqual([]);
    });

    it("draws over none of the ninths that go under", () => {
        expect(pathParts(bits([1, 2], [2, 2], [3, 2]), ninthsOf(4))).toEqual([part(0, 1, 1, 1), part(2, 1, 1, 1)]);
    });

    it("draws over a ninth of none at the inside of a turn, in as few rectangles as a walk along its rows finds", () => {
        // Along the top row and down the east column: the middle ninth is the inside of the turn at its north-east
        // corner, the west column's other two and the south middle ninth no turn's
        expect(pathParts(bits([1, 1], [2, 1], [3, 1], [3, 2], [3, 3]), 0))
            .toEqual([part(0, 0, 3, 1), part(1, 1, 2, 1), part(2, 2, 1, 1)]);
    });

    it("draws over the whole of a tile a cross of paths runs through, each corner the inside of a turn", () => {
        expect(pathParts(bits([2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [2, 4]), 0))
            .toEqual([part(0, 0, 3, 3)]);
    });
});

describe("a path's look", () => {

    it.each([[ROADS, true], [HTRFBASE + 2, true], [LHRAIL, true], [LVRAIL10, true], [HBRDG0, true],
             [DIRT, false], [WOODS2, false], [FOUNTAIN, false]])("on tile %i is paving: %s", (id, paved) => {
        expect(isPaved(id)).toBe(paved);
    });
});

describe("what an underpass goes under", () => {

    it("is a road's carriageway, and every ninth of a tile of rail", () => {
        const all = ninthsOf(0, 1, 2, 3, 4, 5, 6, 7, 8);
        expect([underWay(LHRAIL), underWay(HRAILROAD), underWay(ROADS2), underWay(DIRT)])
            .toEqual([all, all, ninthsOf(1, 4, 7), 0]);
    });

    describe("round a tile", () => {

        // A row of three tiles, the middle a rail down, with the walkway values given
        const row = (walkways: number[]) => ({width: 3, height: 1, walkways});
        const rowIds = [DIRT, LVRAIL, DIRT];
        const idAt = (index: number) => rowIds[index];

        it("goes under the whole rail tile where an underpass lies on it, and beside it across each tile's edge", () => {
            // A path across the row's middle ninths, an underpass across the rail's
            const walkways = [path(3, 4, 5), walkwayOf([3, 4, 5], "underpass"), path(3, 4, 5)];
            // Beside the west tile's east edge, its ring's east side, its second ninth, and the east tile's west side's
            expect([underAround(row(walkways), idAt, 0, 0), underAround(row(walkways), idAt, 1, 0),
                    underAround(row(walkways), idAt, 2, 0)])
                .toEqual([{own: 0, ring: 1 << (3 + 1)}, {own: ninthsOf(3, 4, 5), ring: 0},
                          {own: 0, ring: 1 << (9 + 1)}]);
        });

        it("goes under nowhere a path lies on the rail, nor off the map", () => {
            expect(underAround(row([0, path(3, 4, 5), 0]), idAt, 1, 0)).toEqual({own: 0, ring: 0});
            expect(underAround(row([0, 0, 0]), idAt, 0, 0)).toEqual({own: 0, ring: 0});
        });

        it("holds the decks in the tile and up and left of it, and which of them run down", () => {
            // A footbridge down the west tile's east column, and across the middle tile's top row, which joins it
            // nowhere north or south
            const walkways = [walkwayOf([2, 5, 8], "footbridge"), walkwayOf([0, 1, 2], "footbridge"), 0];
            // The middle tile's window: the west's east column, (0, 1) to (0, 3), bits 4, 8 and 12, running down, and
            // its own top row, (1, 1) to (3, 1), bits 5 to 7, across
            const west = (1 << 4) | (1 << 8) | (1 << 12);
            expect(decksAround(row(walkways), 1, 0)).toEqual({decks: west | (1 << 5) | (1 << 6) | (1 << 7),
                                                             runsDown: west});
            // The east tile's: the middle's ninth 2 in its (0, 1), bit 4
            expect(decksAround(row(walkways), 2, 0)).toEqual({decks: 1 << 4, runsDown: 0});
        });
    });
});
