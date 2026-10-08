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

import { createHash } from "crypto";

import {
    GRASS_MAP, bakeGrassField, edgeWobble, grassFieldPixels, grassTile, grassTint, latticeHash, lowbias32, strawShare,
} from "../src/grass";
import { parseRenderManifest } from "../src/renderManifest";
import { repositoryJson } from "./helpers/repository";

// The world grass's hash and noise against conformance/grass.json, which the art build's grass.py writes with the same
// arithmetic, from the constants of the committed manifest's grass and canopy sections: the two must agree to the last bit, or the
// grass the client draws is not the grass the build made its sets and page background for.

interface Vectors {
  lowbias32: {in: number, out: number}[];
  hashes: {x: number, y: number, seed: number, hash: number}[];
  tiles: {x: number, y: number, tile: number}[];
  noise: {x: number, y: number, straw: number, tint: number, edge: number, shore: number}[];
  field: {width: number, height: number, sha256: string};
}

const vectors = repositoryJson<Vectors>("conformance/grass.json");
const {grass, canopy, water} = parseRenderManifest(repositoryJson("images/render/manifest.json"));
const {width: WIDTH, height: HEIGHT} = GRASS_MAP;

describe("the world grass", () => {

    it.each(vectors.lowbias32)("hashes $in as the build does", ({in: value, out}) => {
        expect(lowbias32(value)).toBe(out);
    });

    it.each(vectors.hashes)("hashes the lattice point ($x, $y) by seed $seed as the build does", ({x, y, seed, hash}) => {
        expect(latticeHash(x, y, seed)).toBe(hash);
    });

    it.each(vectors.tiles)("picks the build's tile for the map tile ($x, $y)", ({x, y, tile}) => {
        expect(grassTile(x, y, grass.constants)).toBe(tile);
    });

    it.each(vectors.noise)("has the build's straw share, tint and the canopy's and the shore's wobble at ($x, $y)",
                           ({x, y, straw, tint, edge, shore}) => {
        expect(strawShare(x, y, grass.constants)).toBe(straw);
        expect(grassTint(x, y, grass.constants)).toBe(tint);
        expect(edgeWobble(x, y, canopy.edge, grass.constants)).toBe(edge);
        expect(edgeWobble(x, y, water.edge, grass.constants)).toBe(shore);
    });

    it("bakes the build's field for the map", () => {
        const field = bakeGrassField(grass.constants, canopy.edge, water.edge, WIDTH, HEIGHT);
        const k = grass.constants.texelsPerTile;
        expect([WIDTH * k, HEIGHT * k]).toEqual([vectors.field.width, vectors.field.height]);
        expect(createHash("sha256").update(field).digest("hex")).toBe(vectors.field.sha256);
    });

    it("packs the field into the texture's red, the share, green, the tint, blue, the canopy's wobble, and alpha, the " +
       "shore's", () => {
        expect(Array.from(grassFieldPixels(new Uint8Array([10, 20, 30, 40, 255, 0, 0, 0, 0, 7, 128, 9]))))
            .toEqual([10, 20, 30, 40, 255, 0, 0, 0, 0, 7, 128, 9]);
    });

    it("picks every tile of a set somewhere on the map, and none past them", () => {
        const picked = new Set<number>();
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                picked.add(grassTile(x, y, grass.constants));
            }
        }
        expect(picked.size).toBe(grass.lush.tiles.length);
        expect(Math.max(...picked)).toBe(grass.lush.tiles.length - 1);
    });
});
