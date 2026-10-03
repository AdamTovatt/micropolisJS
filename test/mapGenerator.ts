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
import { RIVER } from "../src/tileValues";

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

    it("places each of a lake's plops at its offset from the lake, drawing x first", () => {
        // Each draw gets an answer looked up by the maximum it asks for, the same every time or the next of a list, so
        // the map is laid out by hand: a cleared map, a river straight up and down at x = 40, one lake of two small
        // plops around (80, 50), and trees straight up from (0, 70)
        const answers: Record<number, number | number[]> = {
            2: 1,     // no island
            40: 0,    // the river starts at x = 40
            33: 0,    // and y = 33
            3: 0,     // and flows north, then south
            100: 0,   // without turning; also the fewest tree splashes
            10: 1,    // one lake
            99: 70,   // at x = 80; also the tree splash's y
            80: 40,   // and y = 50
            12: [0, 10, 3, 1, 8],  // of two plops, at (84, 47) and (75, 52): offset by (+4, -3) and (-5, +2)
            4: 1,     // each a small one
            1: 0,     // river edges as they are
            119: 0,   // the tree splash's x
            150: 0,   // the fewest trees
            7: 0,     // splashed north
        };
        const random = {
            getRandom(max: number): number {
                const answer = answers[max];
                if (answer === undefined || (Array.isArray(answer) && answer.length === 0)) {
                    throw new Error(`No answer for getRandom(${max})`);
                }

                return Array.isArray(answer) ? answer.shift()! : answer;
            },
        };

        const map = MapGenerator(random);

        // The water a small plop lays from its corner: its matrix's river tiles, which smoothing leaves as they are
        const plopWater = (x: number, y: number) =>
            [[2, 1], [3, 1], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [4, 3], [2, 4], [3, 4]]
                .map(([dx, dy]) => `${x + dx},${y + dy}`);
        // The water around the lake, clear of the river and the trees
        const water: string[] = [];
        for (let y = 30; y < 75; y++) {
            for (let x = 60; x < 105; x++) {
                if (map.getTileValue(x, y) === RIVER) {
                    water.push(`${x},${y}`);
                }
            }
        }

        expect(answers[12]).toEqual([]);
        expect(water.sort()).toEqual([...plopWater(84, 47), ...plopWater(75, 52)].sort());
    });
});
