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

import { COMPOSITE_CELL, CompositeRecord, FrameRecord, damagedPixels } from "../src/mapDamage";
import type { DrawnSquare } from "../src/mapDamage";
import type { FrameTiles } from "../src/mapFrame";

// Two tile ids other than dirt's, 0: the record reads values and frames, not art
const ZONE = 5;
const LAWN = 6;

describe("the record of the map's layer drawn last", () => {

    // A view of 20 by 16 tiles, three blocks across and two down, the last column of blocks 4 tiles wide, with a
    // margin of 1 for the farthest shadow, from map tile (10, 20)
    const VIEW_WIDTH = 20;
    const VIEW_HEIGHT = 16;
    const view = {originX: 11, originY: 21, tilePixels: 16, width: 320, height: 256};

    // The area with the tiles given, by column and row from the view's origin, and dirt everywhere else
    function area(...placed: {column: number, row: number, value: number, frame?: number}[]): FrameTiles {
        const width = VIEW_WIDTH + 2;
        const values = new Array<number>(width * (VIEW_HEIGHT + 2)).fill(0);
        const frames = values.slice();
        for (const {column, row, value, frame} of placed) {
            values[(row + 1) * width + column + 1] = value;
            frames[(row + 1) * width + column + 1] = frame ?? value;
        }
        return {x: 10, y: 20, width, height: VIEW_HEIGHT + 2, margin: 1, offset: {x: 0, y: 0}, values, frames};
    }

    // A record of a frame of the view and the dirt
    function recorded(): FrameRecord {
        const record = new FrameRecord();
        record.damage(view, area());
        return record;
    }

    it("draws all of a first frame", () => {
        expect(new FrameRecord().damage(view, area())).toBe("all");
    });

    it("draws nothing of the same frame again, in a view of the same values", () => {
        expect(recorded().damage({...view}, area())).toBeNull();
    });

    it.each([
        ["origin's column", {originX: 12}],
        ["origin's row", {originY: 22}],
        ["pixels a tile", {tilePixels: 32}],
        ["width", {width: 321}],
        ["height", {height: 257}],
    ])("draws all of the view when its %s changes", (_, change) => {
        expect(recorded().damage({...view, ...change}, area())).toBe("all");
    });

    it("draws again the block of a tile whose value changed, as far as a shadow reaches from it", () => {
        expect(recorded().damage(view, area({column: 10, row: 3, value: ZONE, frame: 0})))
            .toEqual([{x: 8, y: 0, width: 8, height: 8}]);
    });

    it("draws again a block a changed tile's shadow may reach into, the row's blocks that touch as one", () => {
        expect(recorded().damage(view, area({column: 8, row: 3, value: ZONE, frame: 0})))
            .toEqual([{x: 0, y: 0, width: 16, height: 8}]);
    });

    it("draws again only the block of a tile whose frame alone changed, which changes no shadow", () => {
        expect(recorded().damage(view, area({column: 8, row: 3, value: 0, frame: LAWN})))
            .toEqual([{x: 8, y: 0, width: 8, height: 8}]);
    });

    it("draws again the blocks in view of a tile in the margin whose value changed", () => {
        expect(recorded().damage(view, area({column: -1, row: 12, value: ZONE})))
            .toEqual([{x: 0, y: 8, width: 8, height: 8}]);
    });

    it("draws again the last column of blocks only as wide as the view", () => {
        expect(recorded().damage(view, area({column: 18, row: 12, value: 0, frame: LAWN})))
            .toEqual([{x: 16, y: 8, width: 4, height: 8}]);
    });

    it("draws all of the view when more than half its blocks changed", () => {
        const changed = [0, 8, 16, 0].map((column, i) => ({column, row: i < 3 ? 2 : 10, value: 0, frame: LAWN}));

        expect(recorded().damage(view, area(...changed))).toBe("all");
    });

    it("draws all of the view after it is invalidated, then nothing again", () => {
        const record = recorded();
        record.invalidate();

        expect([record.damage(view, area()), record.damage(view, area())]).toEqual(["all", null]);
    });

    it("keeps its own copy of the view", () => {
        const record = new FrameRecord();
        const shown = {...view};
        record.damage(shown, area());
        shown.originX = 12;

        expect(record.damage(shown, area())).toBe("all");
    });

    it("keeps its own copy of the tiles, which the canvas fills again on each paint", () => {
        const record = new FrameRecord();
        const shown = area();
        record.damage(view, shown);
        (shown.frames as number[])[(3 + 1) * (VIEW_WIDTH + 2) + 2 + 1] = LAWN;

        expect(record.damage(view, shown)).toEqual([{x: 0, y: 0, width: 8, height: 8}]);
    });
});

describe("the device pixels of the damage", () => {

    const NONE = {x: 0, y: 0};

    it("are the tiles' pixels, where a tile's edges fall on whole pixels", () => {
        expect(damagedPixels([{x: 8, y: 0, width: 4, height: 8}], 32, NONE))
            .toEqual([{x: 256, y: 0, width: 128, height: 256}]);
    });

    it("take in, rounded out, each pixel a tile's edge falls within", () => {
        // At 17.6 pixels a tile, tiles 8 to 15 run from pixel 140.8 to 281.6, and tile 8's row from 140.8 to 158.4
        expect(damagedPixels([{x: 8, y: 8, width: 8, height: 1}], 17.6, NONE))
            .toEqual([{x: 140, y: 140, width: 142, height: 19}]);
    });

    it("are moved back by the view's offset into its first tile", () => {
        // The view starts 5 pixels right of and 3 below its first tile's top-left
        expect(damagedPixels([{x: 0, y: 0, width: 1, height: 1}, {x: 8, y: 0, width: 4, height: 8}], 32, {x: 5, y: 3}))
            .toEqual([{x: -5, y: -3, width: 32, height: 32}, {x: 251, y: -3, width: 128, height: 256}]);
    });
});

describe("the record of the canvas composited last", () => {

    // A canvas of 8 by 4 cells
    const WIDTH = 8 * COMPOSITE_CELL;
    const HEIGHT = 4 * COMPOSITE_CELL;
    const CELL = COMPOSITE_CELL;

    // A square of side pixels from (left, top), drawing what key names, which is its drawing too
    function square(key: string, left: number, top: number, side = 16): DrawnSquare<string> {
        return {drawing: key, key, left, top, right: left + side - 1, bottom: top + side - 1};
    }

    // A record that last composited the squares
    function recorded(...squares: DrawnSquare<string>[]): CompositeRecord<string> {
        const record = new CompositeRecord<string>();
        record.composite(WIDTH, HEIGHT, null, squares);
        return record;
    }

    it("copies all of the layer, and draws every square, when the layer was drawn whole", () => {
        const squares = [square("a", 0, 0), square("b", 100, 100)];

        expect(new CompositeRecord<string>().composite(WIDTH, HEIGHT, null, squares))
            .toEqual({areas: null, drawn: ["a", "b"]});
    });

    it("composites nothing when nothing changed", () => {
        expect(recorded(square("a", 0, 0)).composite(WIDTH, HEIGHT, [], [square("a", 0, 0)])).toBeNull();
    });

    it("copies the layer over the cells where a square that changed was and is, and draws only it", () => {
        const record = recorded(square("a", 4, 4), square("far", 6 * CELL + 4, 4));

        expect(record.composite(WIDTH, HEIGHT, [], [square("a2", 3 * CELL + 4, 4), square("far", 6 * CELL + 4, 4)]))
            .toEqual({areas: [{x: 0, y: 0, width: CELL, height: CELL}, {x: 3 * CELL, y: 0, width: CELL, height: CELL}],
                      drawn: ["a2"]});
    });

    it("copies the layer over where a square that's gone was, drawing nothing", () => {
        expect(recorded(square("a", 4, 4)).composite(WIDTH, HEIGHT, [], []))
            .toEqual({areas: [{x: 0, y: 0, width: CELL, height: CELL}], drawn: []});
    });

    it("tells squares that draw the same apart by how many there are", () => {
        // Two cars drawn the same in one place, and one of them gone: the other is drawn again over the layer there
        const record = recorded(square("a", 4, 4), square("a", 4, 4));

        expect(record.composite(WIDTH, HEIGHT, [], [square("a", 4, 4)]))
            .toEqual({areas: [{x: 0, y: 0, width: CELL, height: CELL}], drawn: ["a"]});
    });

    it("copies the layer over every square that reaches into its cells, and those they reach into in turn", () => {
        // b reaches from the first cell into the second, and c from the second into the third
        const b = square("b", CELL - 8, 4);
        const c = square("c", 2 * CELL - 8, 4);
        const record = recorded(square("a", 4, 4), b, c);

        expect(record.composite(WIDTH, HEIGHT, [], [square("a2", 5, 4), b, c]))
            .toEqual({areas: [{x: 0, y: 0, width: 3 * CELL, height: CELL}], drawn: ["a2", "b", "c"]});
    });

    it("copies the layer where it was drawn again, and draws the squares there", () => {
        const a = square("a", 4, 2 * CELL + 4);

        expect(recorded(a).composite(WIDTH, HEIGHT, [{x: 0, y: 2 * CELL, width: 10, height: 10}], [a]))
            .toEqual({areas: [{x: 0, y: 2 * CELL, width: CELL, height: CELL}], drawn: ["a"]});
    });

    it("copies all of the layer, drawing every square, when more than half the cells changed", () => {
        // A square in each of one cell more than half the canvas's, changed
        const across = WIDTH / CELL;
        const changed = across * (HEIGHT / CELL) / 2 + 1;
        const before = Array.from({length: changed},
                                  (_, i) => square(`a${i}`, (i % across) * CELL, Math.floor(i / across) * CELL));
        const after = before.map((s) => square(`${s.key}!`, s.left, s.top));

        expect(recorded(...before).composite(WIDTH, HEIGHT, [], after))
            .toEqual({areas: null, drawn: after.map(({key}) => key)});
    });

    it("leaves out the part of a square past the canvas's edges", () => {
        expect(recorded(square("a", -8, -8)).composite(WIDTH, HEIGHT, [], [square("a2", -8, -8)]))
            .toEqual({areas: [{x: 0, y: 0, width: CELL, height: CELL}], drawn: ["a2"]});
    });
});
