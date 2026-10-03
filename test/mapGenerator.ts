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

// Every tile's raw value, flags included
function rawTiles(seed: number): number[] {
    const saveData: {map?: {value: number}[]} = {};
    MapGenerator(Random.mapStream(seed)).save(saveData);
    return saveData.map!.map((tile) => tile.value);
}

describe("the map generator", () => {

    it("generates the same map, tile for tile, from the same seed", () => {
        expect(rawTiles(1234)).toEqual(rawTiles(1234));
    });

    it("generates a different map from a different seed", () => {
        expect(rawTiles(1234)).not.toEqual(rawTiles(1235));
    });
});
