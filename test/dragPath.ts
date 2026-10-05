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

import { dragPath, ToolPaths } from "../src/dragPath";

const xy = (path: {x: number, y: number}[]) => path.map(({x, y}) => [x, y]);

describe("a drag's path", () => {

    it("is empty when the mouse stays on its tile", () => {
        expect(dragPath({x: 5, y: 5}, {x: 5, y: 5})).toEqual([]);
    });

    it.each([
        ["east", {x: 8, y: 5}, [[6, 5], [7, 5], [8, 5]]],
        ["west", {x: 3, y: 5}, [[4, 5], [3, 5]]],
        ["south", {x: 5, y: 7}, [[5, 6], [5, 7]]],
        ["north", {x: 5, y: 2}, [[5, 4], [5, 3], [5, 2]]],
    ])("runs straight %s along its row or column", (_, to, path) => {
        expect(xy(dragPath({x: 5, y: 5}, to))).toEqual(path);
    });

    // The line between the centres passes through each corner, where the column comes first
    it("steps a diagonal as a staircase, column first", () => {
        expect(xy(dragPath({x: 0, y: 0}, {x: 2, y: 2}))).toEqual([[1, 0], [1, 1], [2, 1], [2, 2]]);
    });

    // From (0, 0) to (4, 1), the line rises half a row by the middle of the run
    it("crosses to the next row where the line between the centres does", () => {
        expect(xy(dragPath({x: 0, y: 0}, {x: 4, y: 1}))).toEqual([[1, 0], [2, 0], [2, 1], [3, 1], [4, 1]]);
    });

    // Every pair of tiles in a 9x9 block, in every direction: the pairs whose path goes wrong are listed, to name them
    it("always reaches the tile, a step along a row or column at a time, as a tool command's path", () => {
        const wrong: object[] = [];
        let checked = 0;

        for (let fromX = 0; fromX < 9; fromX++) {
            for (let fromY = 0; fromY < 9; fromY++) {
                for (let toX = 0; toX < 9; toX++) {
                    for (let toY = 0; toY < 9; toY++) {
                        const from = {x: fromX, y: fromY};
                        const to = {x: toX, y: toY};
                        const path = dragPath(from, to);
                        const ends = path.length === 0 ? from : path[path.length - 1];
                        // A tool command's path moves one tile along a row or a column from each tile to the next
                        const tiles = [from, ...path];
                        const stepsOne = path.every((tile, i) =>
                            Math.abs(tile.x - tiles[i].x) + Math.abs(tile.y - tiles[i].y) === 1);
                        checked++;

                        if (path.length !== Math.abs(toX - fromX) + Math.abs(toY - fromY) ||
                            ends.x !== toX || ends.y !== toY || !stepsOne) {
                            wrong.push({from, to, path});
                        }
                    }
                }
            }
        }

        expect(checked).toBe(9 ** 4);
        expect(wrong).toEqual([]);
    });
});

describe("the tool paths a player's input makes", () => {

    const tile = (x: number, y: number) => ({x, y});

    it("are none before the tool reaches a tile", () => {
        expect(new ToolPaths().take()).toEqual([]);
    });

    it("are each click's tile, in the order clicked", () => {
        const paths = new ToolPaths();
        paths.reached("park", tile(3, 3), true);
        paths.reached("park", tile(9, 9), true);

        expect(paths.take()).toEqual([{tool: "park", path: [tile(3, 3)]}, {tool: "park", path: [tile(9, 9)]}]);
    });

    it("are a drag's tiles, with those a fast mouse skipped filled in", () => {
        const paths = new ToolPaths();
        paths.reached("road", tile(2, 2), true);
        paths.reached("road", tile(5, 2), false);

        expect(paths.take()).toEqual([{tool: "road", path: [tile(2, 2), tile(3, 2), tile(4, 2), tile(5, 2)]}]);
    });

    // Each tick sends what the drag reached since the last
    it("go on with a drag still under way in a new path, from the tile it last reached", () => {
        const paths = new ToolPaths();
        paths.reached("wire", tile(2, 2), true);
        paths.take();
        paths.reached("wire", tile(2, 4), false);

        expect(paths.take()).toEqual([{tool: "wire", path: [tile(2, 3), tile(2, 4)]}]);
        expect(paths.take()).toEqual([]);
    });

    it("start afresh where a drag comes back onto the map", () => {
        const paths = new ToolPaths();
        paths.reached("road", tile(0, 5), true);
        paths.lost();
        paths.reached("road", tile(0, 9), false);

        expect(paths.take()).toEqual([{tool: "road", path: [tile(0, 5)]}, {tool: "road", path: [tile(0, 9)]}]);
    });

    it("start afresh when the tool changes", () => {
        const paths = new ToolPaths();
        paths.reached("road", tile(1, 1), true);
        paths.reached("rail", tile(2, 1), false);

        expect(paths.take()).toEqual([{tool: "road", path: [tile(1, 1)]}, {tool: "rail", path: [tile(2, 1)]}]);
    });
});
