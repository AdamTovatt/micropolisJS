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

import { FrameRecord, damagedPixels } from "../src/mapDamage";
import type { FrameTiles } from "../src/mapFrame";

// Two tile ids other than dirt's, 0: the record reads values and frames, not art
const ZONE = 5;
const LAWN = 6;

describe("the record of the frame drawn last", () => {

    // A view of 20 by 16 tiles, three blocks across and two down, the last column of blocks 4 tiles wide, with a
    // margin of 1 for the farthest shadow, from map tile (10, 20)
    const VIEW_WIDTH = 20;
    const VIEW_HEIGHT = 16;
    const view = {originX: 11, originY: 21, tilePixels: 16, width: 320, height: 256};
    // The view's origin, in map pixels
    const ORIGIN = {x: 11 * 16, y: 21 * 16};

    // The area with the tiles given, by column and row from the view's origin, and dirt everywhere else
    function area(...placed: {column: number, row: number, value: number, frame?: number}[]): FrameTiles {
        const width = VIEW_WIDTH + 2;
        const values = new Array<number>(width * (VIEW_HEIGHT + 2)).fill(0);
        const frames = values.slice();
        for (const {column, row, value, frame} of placed) {
            values[(row + 1) * width + column + 1] = value;
            frames[(row + 1) * width + column + 1] = frame ?? value;
        }
        return {x: 10, y: 20, width, height: VIEW_HEIGHT + 2, margin: 1, values, frames};
    }

    const train = {type: 1, frame: 2, x: ORIGIN.x + 2 * 16, y: ORIGIN.y + 2 * 16, width: 32};

    // A record of a frame of the view, the dirt and the train
    function recorded(): FrameRecord {
        const record = new FrameRecord();
        record.damage(view, area(), [train]);
        return record;
    }

    it("draws all of a first frame", () => {
        expect(new FrameRecord().damage(view, area(), [train])).toBe("all");
    });

    it("draws nothing of the same frame again, in a view of the same values", () => {
        expect(recorded().damage({...view}, area(), [{...train}])).toBeNull();
    });

    it.each([
        ["origin's column", {originX: 12}],
        ["origin's row", {originY: 22}],
        ["pixels a tile", {tilePixels: 32}],
        ["width", {width: 321}],
        ["height", {height: 257}],
    ])("draws all of the view when its %s changes", (_, change) => {
        expect(recorded().damage({...view, ...change}, area(), [train])).toBe("all");
    });

    it("draws again the block of a tile whose value changed, as far as a shadow reaches from it", () => {
        expect(recorded().damage(view, area({column: 10, row: 3, value: ZONE, frame: 0}), [train]))
            .toEqual([{x: 8, y: 0, width: 8, height: 8}]);
    });

    it("draws again a block a changed tile's shadow may reach into, the row's blocks that touch as one", () => {
        expect(recorded().damage(view, area({column: 8, row: 3, value: ZONE, frame: 0}), [train]))
            .toEqual([{x: 0, y: 0, width: 16, height: 8}]);
    });

    it("draws again only the block of a tile whose frame alone changed, which changes no shadow", () => {
        expect(recorded().damage(view, area({column: 8, row: 3, value: 0, frame: LAWN}), [train]))
            .toEqual([{x: 8, y: 0, width: 8, height: 8}]);
    });

    it("draws again the blocks in view of a tile in the margin whose value changed", () => {
        expect(recorded().damage(view, area({column: -1, row: 12, value: ZONE}), [train]))
            .toEqual([{x: 0, y: 8, width: 8, height: 8}]);
    });

    it("draws again the last column of blocks only as wide as the view", () => {
        expect(recorded().damage(view, area({column: 18, row: 12, value: 0, frame: LAWN}), [train]))
            .toEqual([{x: 16, y: 8, width: 4, height: 8}]);
    });

    it("draws again where a sprite that changed was, and where it is", () => {
        const moved = {...train, x: ORIGIN.x + 17 * 16, y: ORIGIN.y + 12 * 16};

        expect(recorded().damage(view, area(), [moved]))
            .toEqual([{x: 0, y: 0, width: 8, height: 8}, {x: 16, y: 8, width: 4, height: 8}]);
    });

    it("draws all of the view when more than half its blocks changed", () => {
        const changed = [0, 8, 16, 0].map((column, i) => ({column, row: i < 3 ? 2 : 10, value: 0, frame: LAWN}));

        expect(recorded().damage(view, area(...changed), [train])).toBe("all");
    });

    it("draws all of the view after it is invalidated, then nothing again", () => {
        const record = recorded();
        record.invalidate();

        expect([record.damage(view, area(), [train]), record.damage(view, area(), [train])]).toEqual(["all", null]);
    });

    it("keeps its own copy of the view", () => {
        const record = new FrameRecord();
        const shown = {...view};
        record.damage(shown, area(), []);
        shown.originX = 12;

        expect(record.damage(shown, area(), [])).toBe("all");
    });

    it("keeps its own copy of the tiles, which the canvas fills again on each paint", () => {
        const record = new FrameRecord();
        const shown = area();
        record.damage(view, shown, []);
        (shown.frames as number[])[(3 + 1) * (VIEW_WIDTH + 2) + 2 + 1] = LAWN;

        expect(record.damage(view, shown, [])).toEqual([{x: 0, y: 0, width: 8, height: 8}]);
    });
});

describe("the device pixels of the damage", () => {

    it("are the tiles' pixels, where a tile's edges fall on whole pixels", () => {
        expect(damagedPixels([{x: 8, y: 0, width: 4, height: 8}], 32)).toEqual([{x: 256, y: 0, width: 128, height: 256}]);
    });

    it("take in, rounded out, each pixel a tile's edge falls within", () => {
        // At 17.6 pixels a tile, tiles 8 to 15 run from pixel 140.8 to 281.6, and tile 8's row from 140.8 to 158.4
        expect(damagedPixels([{x: 8, y: 8, width: 8, height: 1}], 17.6))
            .toEqual([{x: 140, y: 140, width: 142, height: 19}]);
    });
});
