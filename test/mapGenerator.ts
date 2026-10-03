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

import { MapGenerator } from "../src/mapGenerator.js";
import { Random } from "../src/random";
import { DIRT, RIVER } from "../src/tileValues";

// Every tile's raw value, flags included
function rawTiles(seed: number): number[] {
    const saveData: {map?: {tiles: number[]}} = {};
    MapGenerator(Random.mapStream(seed)).save(saveData);
    return saveData.map!.tiles;
}

describe("the map generator", () => {

    it("generates the same map, tile for tile, from the same seed", () => {
        expect(rawTiles(1234)).toEqual(rawTiles(1234));
    });

    it("generates a different map from a different seed", () => {
        expect(rawTiles(1234)).not.toEqual(rawTiles(1235));
    });

    it("places a lake where the stream puts it", () => {
        // Each draw gets a fixed answer, looked up by the maximum it asks for, so the map is laid out by hand: a
        // cleared map, a river straight up and down at x = 40, one lake of small plops at (80, 50), and trees straight
        // up from (0, 70)
        const answers: Record<number, number> = {
            2: 1,     // no island
            40: 0,    // the river starts at x = 40
            33: 0,    // and y = 33
            3: 0,     // and flows north, then south
            100: 0,   // without turning; also the fewest tree splashes
            10: 1,    // one lake
            99: 70,   // at x = 80; also the tree splash's y
            80: 40,   // and y = 50
            12: 6,    // of eight plops, each offset by nothing
            4: 1,     // each a small one
            1: 0,     // river edges as they are
            119: 0,   // the tree splash's x
            150: 0,   // the fewest trees
            7: 0,     // splashed north
        };
        const random = {
            getRandom(max: number): number {
                if (!(max in answers)) {
                    throw new Error(`No answer for getRandom(${max})`);
                }

                return answers[max];
            },
        };

        const map = MapGenerator(random);

        // The middle of a small plop
        expect(map.getTileValue(82, 52)).toBe(RIVER);
        // Clear of the lake, the river and the trees
        expect(map.getTileValue(100, 52)).toBe(DIRT);
    });
});
