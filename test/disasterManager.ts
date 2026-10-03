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

import { DisasterManager } from "../src/disasterManager.js";
import { GameMap } from "../src/gameMap.js";
import { BLBNBIT, BULLBIT } from "../src/tileFlags";
import { DIRT, FIRSTRIVEDGE, FLOOD, RUBBLE, WOODS } from "../src/tileValues";
import { streamAlwaysDrawing } from "./helpers/streams";


describe("the disaster manager", () => {

    describe("when starting a flood", () => {

        // Every attempt to find water lands on the river edge, which floods its neighbours
        const RIVER_EDGE_X = 10;
        const RIVER_EDGE_Y = 10;
        const NEIGHBOURS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

        function makeDisasterManager(map: InstanceType<typeof GameMap>) {
            return new DisasterManager(map, null, 0, streamAlwaysDrawing(RIVER_EDGE_X));
        }

        function makeMap(neighbourValue: number, neighbourFlags: number) {
            const map = new GameMap(120, 100);
            map.setTile(RIVER_EDGE_X, RIVER_EDGE_Y, FIRSTRIVEDGE, 0);
            for (const [dx, dy] of NEIGHBOURS) {
                map.setTile(RIVER_EDGE_X + dx, RIVER_EDGE_Y + dy, neighbourValue, neighbourFlags);
            }
            return map;
        }

        it("should flood dirt next to water", () => {
            const map = makeMap(DIRT, 0);

            makeDisasterManager(map).makeFlood();

            expect(map.getTileValue(RIVER_EDGE_X, RIVER_EDGE_Y - 1)).toBe(FLOOD);
        });

        it("should flood bulldozable land that can burn", () => {
            const map = makeMap(WOODS, BLBNBIT);

            makeDisasterManager(map).makeFlood();

            expect(map.getTileValue(RIVER_EDGE_X, RIVER_EDGE_Y - 1)).toBe(FLOOD);
        });

        it("should not flood bulldozable land that cannot burn", () => {
            const map = makeMap(RUBBLE, BULLBIT);

            makeDisasterManager(map).makeFlood();

            for (const [dx, dy] of NEIGHBOURS) {
                expect(map.getTileValue(RIVER_EDGE_X + dx, RIVER_EDGE_Y + dy)).toBe(RUBBLE);
            }
        });

        it("should not flood dirt that carries flags", () => {
            const map = makeMap(DIRT, BULLBIT);

            makeDisasterManager(map).makeFlood();

            for (const [dx, dy] of NEIGHBOURS) {
                expect(map.getTileValue(RIVER_EDGE_X + dx, RIVER_EDGE_Y + dy)).toBe(DIRT);
            }
        });
    });
});
