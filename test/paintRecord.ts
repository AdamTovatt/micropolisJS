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

import { PaintRecord, REPAINT, forEachTileToPaint, markAreaForRepaint } from "../src/paintRecord";

// The tiles painted, as [tile, x, y], in the order painted
function painted(lastPainted: number[] | null, lastWidth: number, lastHeight: number, tiles: number[], width: number,
                 height: number): number[][] {
    const calls: number[][] = [];
    forEachTileToPaint(lastPainted, lastWidth, lastHeight, tiles, width, height,
                       (tile, x, y) => calls.push([tile, x, y]));
    return calls;
}

// The tiles a paint record paints, as [tile, x, y], in the order painted
function recordPaint(record: PaintRecord, tiles: number[], width: number, height: number): number[][] {
    const calls: number[][] = [];
    record.paint(tiles, width, height, (tile, x, y) => calls.push([tile, x, y]));
    return calls;
}

describe("the paint record", () => {

    describe("choosing the tiles to paint", () => {

        it("paints every tile on a first paint, in rows", () => {
            expect(painted(null, -1, -1, [1, 2, 3, 4, 5, 6], 3, 2)).toEqual(
                [[1, 0, 0], [2, 1, 0], [3, 2, 0], [4, 0, 1], [5, 1, 1], [6, 2, 1]]);
        });

        it("paints only the tiles that changed", () => {
            expect(painted([1, 2, 3, 4, 5, 6], 3, 2, [1, 2, 3, 4, 9, 6], 3, 2)).toEqual([[9, 1, 1]]);
        });

        it("repaints the tiles marked for repaint", () => {
            expect(painted([1, REPAINT, 3, REPAINT, 5, 6], 3, 2, [1, 2, 3, 4, 5, 6], 3, 2)).toEqual(
                [[2, 1, 0], [4, 0, 1]]);
        });

        it("paints the extra height of a view that grew taller", () => {
            expect(painted([1, 2], 2, 1, [1, 2, 3, 4], 2, 2)).toEqual([[3, 0, 1], [4, 1, 1]]);
        });

        it("compares each tile with the one last painted in its place in a view that grew wider", () => {
            // The tiles in view before and after are the same, so only the new column is painted
            expect(painted([1, 2, 4, 5], 2, 2, [1, 2, 3, 4, 5, 6], 3, 2)).toEqual([[3, 2, 0], [6, 2, 1]]);
        });

        it("compares each tile with the one last painted in its place in a view that grew narrower", () => {
            expect(painted([1, 2, 3, 4, 5, 6], 3, 2, [1, 2, 4, 9], 2, 2)).toEqual([[9, 1, 1]]);
        });
    });

    describe("what it painted", () => {

        it("paints every tile the first time", () => {
            expect(recordPaint(new PaintRecord(), [1, 2, 3, 4], 2, 2)).toHaveLength(4);
        });

        it("paints nothing when the tiles are the same", () => {
            const record = new PaintRecord();
            recordPaint(record, [1, 2, 3, 4], 2, 2);

            expect(recordPaint(record, [1, 2, 3, 4], 2, 2)).toEqual([]);
        });

        it("hands out a buffer apart from the tiles it last painted", () => {
            const record = new PaintRecord();
            recordPaint(record, [1, 2, 3, 4], 2, 2);
            recordPaint(record, [1, 2, 3, 4], 2, 2);

            // The next paint's tiles are written into the buffer, which must not overwrite the last paint's
            const next = record.buffer;
            next.splice(0, next.length, 1, 2, 3, 9);

            expect(recordPaint(record, next, 2, 2)).toEqual([[9, 1, 1]]);
        });

        it("repaints an area drawn over since it painted", () => {
            const record = new PaintRecord();
            recordPaint(record, [1, 2, 3, 4, 5, 6], 3, 2);

            record.markForRepaint({x: 1, xBound: 3, y: 1, yBound: 2});

            expect(recordPaint(record, [1, 2, 3, 4, 5, 6], 3, 2)).toEqual([[5, 1, 1], [6, 2, 1]]);
        });

        it("repaints every tile when asked to", () => {
            const record = new PaintRecord();
            recordPaint(record, [1, 2, 3, 4], 2, 2);

            record.repaintAll();

            expect(recordPaint(record, [1, 2, 3, 4], 2, 2)).toHaveLength(4);
        });

        it("paints every tile once it forgets what it painted", () => {
            const record = new PaintRecord();
            recordPaint(record, [1, 2, 3, 4], 2, 2);

            record.forget();

            expect(recordPaint(record, [1, 2, 3, 4], 2, 2)).toHaveLength(4);
        });

        it("ignores marks before its first paint", () => {
            const record = new PaintRecord();

            record.markForRepaint({x: 0, xBound: 2, y: 0, yBound: 2});
            record.repaintAll();

            expect(recordPaint(record, [1, 2, 3, 4], 2, 2)).toHaveLength(4);
        });
    });

    describe("marking an area for repaint", () => {

        it("marks the area's tiles, clipped to the view", () => {
            const lastPainted = new Array(12).fill(0);

            // A view four tiles wide and three high, and an area that runs off its west and south edges
            markAreaForRepaint(lastPainted, {x: -1, xBound: 2, y: 1, yBound: 5}, 4, 3);

            expect(lastPainted).toEqual([0, 0, 0, 0, REPAINT, REPAINT, 0, 0, REPAINT, REPAINT, 0, 0]);
        });

        it("marks nothing for an empty area", () => {
            const lastPainted = new Array(12).fill(0);

            markAreaForRepaint(lastPainted, {x: 2, xBound: 2, y: 1, yBound: 1}, 4, 3);

            expect(lastPainted).toEqual(new Array(12).fill(0));
        });
    });
});
