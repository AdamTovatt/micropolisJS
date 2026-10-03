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

import { BlockMap } from "../src/blockMap";
import { GameMap } from "../src/gameMap.js";
import { BNCNBIT, BULLBIT, ZONEBIT } from "../src/tileFlags";
import { RIVER, RZB, WOODS } from "../src/tileValues";
import { ZoneUtils } from "../src/zoneUtils.js";

describe("zone utilities", () => {

    describe("when a residential zone catches fire", () => {

        // A 3x3 residential zone around (50, 50), on a map whose top row is dirt
        const CENTRE_X = 50;
        const CENTRE_Y = 50;

        function makeZone() {
            const map = new GameMap(120, 100);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const isCentre = dx === 0 && dy === 0;
                    map.setTile(CENTRE_X + dx, CENTRE_Y + dy, RZB + dx + 3 * dy, BNCNBIT | (isCentre ? ZONEBIT : 0));
                }
            }
            return map;
        }

        function burn(map: InstanceType<typeof GameMap>) {
            ZoneUtils.fireZone(map, CENTRE_X, CENTRE_Y, {rateOfGrowthMap: new BlockMap(120, 100, 8)});
        }

        it("should make every tile of the zone bulldozable", () => {
            const map = makeZone();

            burn(map);

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    expect(map.getTileFlags(CENTRE_X + dx, CENTRE_Y + dy) & BULLBIT).toBe(BULLBIT);
                }
            }
        });

        it("should leave a tile below the roads alone, whatever lies in the map's top row", () => {
            const map = makeZone();
            map.setTile(CENTRE_X - 1, CENTRE_Y - 1, WOODS, BNCNBIT);
            map.setTile(CENTRE_X - 1, 0, RIVER, 0);

            burn(map);

            expect(map.getTileFlags(CENTRE_X - 1, CENTRE_Y - 1) & BULLBIT).toBe(0);
        });
    });
});
