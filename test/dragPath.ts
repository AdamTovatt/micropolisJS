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

import { dragPath, pathCommand, ToolPaths } from "../src/dragPath";

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
        paths.reached("park", false, tile(3, 3), true);
        paths.reached("park", false, tile(9, 9), true);

        expect(paths.take()).toEqual([{tool: "park", erase: false, path: [tile(3, 3)]},
                                      {tool: "park", erase: false, path: [tile(9, 9)]}]);
    });

    it("are a drag's tiles, with those a fast mouse skipped filled in", () => {
        const paths = new ToolPaths();
        paths.reached("road", false, tile(2, 2), true);
        paths.reached("road", false, tile(5, 2), false);

        expect(paths.take()).toEqual([{tool: "road", erase: false, path: [tile(2, 2), tile(3, 2), tile(4, 2), tile(5, 2)]}]);
    });

    // The walkway's places are ninths on the map's grid of them, which a drag fills in as it does tiles
    it("are a drag's ninths for the walkway, erasing or not", () => {
        const paths = new ToolPaths();
        paths.reached("walkway", true, tile(30, 31), true);
        paths.reached("walkway", true, tile(30, 33), false);

        expect(paths.take()).toEqual([{tool: "walkway", erase: true, path: [tile(30, 31), tile(30, 32), tile(30, 33)]}]);
    });

    // Each tick sends what the drag reached since the last
    it("go on with a drag still under way in a new path, from the tile it last reached", () => {
        const paths = new ToolPaths();
        paths.reached("wire", false, tile(2, 2), true);
        paths.take();
        paths.reached("wire", false, tile(2, 4), false);

        expect(paths.take()).toEqual([{tool: "wire", erase: false, path: [tile(2, 3), tile(2, 4)]}]);
        expect(paths.take()).toEqual([]);
    });

    it("go on erasing with an erasing drag still under way in its new path", () => {
        const paths = new ToolPaths();
        paths.reached("wire", true, tile(2, 2), true);
        paths.take();
        paths.reached("wire", true, tile(2, 4), false);

        expect(paths.take()).toEqual([{tool: "wire", erase: true, path: [tile(2, 3), tile(2, 4)]}]);
    });

    it("start afresh where a drag comes back onto the map", () => {
        const paths = new ToolPaths();
        paths.reached("road", false, tile(0, 5), true);
        paths.lost();
        paths.reached("road", false, tile(0, 9), false);

        expect(paths.take()).toEqual([{tool: "road", erase: false, path: [tile(0, 5)]},
                                      {tool: "road", erase: false, path: [tile(0, 9)]}]);
    });

    it.each([["the tool", "rail", false], ["whether it erases", "road", true]] as const)(
        "start afresh when %s changes", (_, tool, erase) => {
            const paths = new ToolPaths();
            paths.reached("road", false, tile(1, 1), true);
            paths.reached(tool, erase, tile(2, 1), false);

            expect(paths.take()).toEqual([{tool: "road", erase: false, path: [tile(1, 1)]},
                                          {tool, erase, path: [tile(2, 1)]}]);
        });
});

describe("the command a tool path makes", () => {

    const path = [{x: 4, y: 5}, {x: 5, y: 5}];

    it.each([
        [{tool: "road", erase: false}, {type: "tool", tool: "road", path, autoBulldoze: true}],
        [{tool: "road", erase: true}, {type: "erase", tool: "road", path}],
        [{tool: "residential", erase: true}, {type: "erase", tool: "residential", path}],
        [{tool: "walkway", erase: false}, {type: "walkway", kind: "path", path}],
        [{tool: "walkway", erase: true}, {type: "eraseWalkway", path}],
    ] as const)("is, for %j, %j", (made, command) => {
        expect(pathCommand({...made, path}, true)).toEqual(command);
    });

    it("is none for a bulldozer's path that erases, the bulldozer having no eraser", () => {
        expect(() => pathCommand({tool: "bulldozer", erase: true, path}, true)).toThrow("The bulldozer has no eraser");
    });
});
