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

import { GRASS_MAP } from "../src/grass";
import { openParkAround, parkTrees, treeChances } from "../src/parkTrees";
import type { ParkGrid } from "../src/parkTrees";
import { RenderArt, parseRenderManifest } from "../src/renderManifest";
import { TILE_INVALID, WOODS2, WOODS5 } from "../src/tileValues";
import { repositoryJson } from "./helpers/repository";
import { walkwayOf } from "./helpers/walkways";

// The committed art's trees
const art = new RenderArt(parseRenderManifest(repositoryJson("images/render/manifest.json")));

// A grid of park tiles, width by height, all open, but for the walkway given on the tiles given
function parkGrid(width: number, height: number, walkways: Record<number, number> = {}): ParkGrid {
    const values = new Array<number>(width * height).fill(WOODS2);
    return {width, height, values, walkways: values.map((_, i) => walkways[i] ?? 0)};
}

// Every ninth of the map in a park of the whole map, and those of them that hold a tree
function wholeMapTrees(): {ninths: number, trees: number} {
    const open = (1 << 25) - 1;
    let trees = 0;
    for (let y = 0; y < GRASS_MAP.height; y++) {
        for (let x = 0; x < GRASS_MAP.width; x++) {
            trees += parkTrees(x, y, open, art.trees, art.treeChance).length;
        }
    }
    return {ninths: GRASS_MAP.width * GRASS_MAP.height * 9, trees};
}

describe("the trees of the parks", () => {

    it("stand on about two ninths in three over the map, gathered into groves round open glades", () => {
        const {ninths, trees} = wholeMapTrees();

        expect(trees / ninths).toBeGreaterThan(0.62);
        expect(trees / ninths).toBeLessThan(0.71);
        // Glades: tiles holding at most two trees, and groves, tiles holding at least eight, each a share of the map
        const open = (1 << 25) - 1;
        const counts = Array.from({length: 40 * 40}, (_, i) =>
            parkTrees(i % 40, Math.floor(i / 40), open, art.trees, art.treeChance).length);
        expect(counts.filter((count) => count <= 2).length / counts.length).toBeGreaterThan(0.08);
        expect(counts.filter((count) => count >= 8).length / counts.length).toBeGreaterThan(0.2);
    });

    it("are of every kind, and sizes spread from the smallest to the largest", () => {
        const open = (1 << 25) - 1;
        const all = Array.from({length: 400}, (_, i) => parkTrees(i % 20, Math.floor(i / 20), open, art.trees,
                                                                  art.treeChance)).flat();
        expect(new Set(all.map(({kind}) => kind)).size).toBe(art.trees.kinds.length);
        expect(Math.min(...all.map(({side}) => side))).toBeGreaterThanOrEqual(art.trees.smallest - 1e-9);
        expect(Math.max(...all.map(({side}) => side))).toBeLessThanOrEqual(art.trees.largest + 1e-9);
        expect(Math.max(...all.map(({side}) => side)) - Math.min(...all.map(({side}) => side)))
            .toBeGreaterThan((art.trees.largest - art.trees.smallest) * 0.9);
    });

    it("stand on no ninth holding walkway, and reach no crown over one, though they stand all round it", () => {
        // Nine park tiles, a path through the middle one's every ninth but its corners, and a footbridge on a corner of
        // the one east of it
        const grid = parkGrid(3, 3, {4: walkwayOf([1, 3, 4, 5, 7]), 5: walkwayOf([0], "footbridge")});
        // The ninths holding walkway, on the grid's grid of ninths
        const held = new Set<string>();
        for (const n of [1, 3, 4, 5, 7]) {
            held.add(`${3 + n % 3},${3 + Math.floor(n / 3)}`);
        }
        held.add("6,3");

        const crowns = [0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => {
            const column = i % 3;
            const row = Math.floor(i / 3);
            return parkTrees(column, row, openParkAround(grid, column, row), {...art.trees, leafy: 1,
                                                                              groves: {octaves: []}},
                             () => 1).map((tree) => ({...tree, x: tree.x + 3 * column, y: tree.y + 3 * row,
                                                       own: `${3 * column + tree.n % 3},${3 * row + Math.floor(tree.n / 3)}`}));
        });

        expect(crowns.length).toBe(81 - 6);
        expect(crowns.filter(({own}) => held.has(own))).toEqual([]);
        // No crown's square covers any part of a ninth holding walkway
        const over = crowns.filter(({x, y, side}) => [...held].some((ninth) => {
            const [nx, ny] = ninth.split(",").map(Number);
            return x < nx + 1 - 1e-9 && x + side > nx + 1e-9 && y < ny + 1 - 1e-9 && y + side > ny + 1e-9;
        }));
        expect(over).toEqual([]);
        // And every crown within the parks
        const e = 1e-9;
        expect(crowns.every(({x, y, side}) => x >= -e && y >= -e && x + side <= 9 + e && y + side <= 9 + e)).toBe(true);
    });

    it("stand on a ninth by the groves' noise moving the leafy share, held from none to every ninth", () => {
        const trees = {...art.trees, leafy: 0.5};
        expect(Array.from(treeChances(trees, new Float32Array([-0.7, -0.5, -0.25, 0, 0.25, 0.5, 0.9]))))
            .toEqual([0, 0, 0.25, 0.5, 0.75, 1, 1]);
    });

    it("take open park only from park tiles on the map, not from the woods, a tile off the map or past the grid", () => {
        const grid: ParkGrid = {width: 3, height: 1, values: [WOODS5, WOODS2 - 1, TILE_INVALID], walkways: [0, 0, 0]};

        // The first tile's own ninths, its window's from (1, 1) to (3, 3), and none of the woods east of it or past
        // the grid west of it
        const window = openParkAround(grid, 0, 0);
        const own = [1, 2, 3].flatMap((wy) => [1, 2, 3].map((wx) => 1 << (wy * 5 + wx))).reduce((a, b) => a | b);
        expect(window).toBe(own);
        expect(openParkAround(grid, 2, 0)).toBe(0);
    });
});
