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

import { GameMap } from "../src/gameMap.js";
import { PowerManager } from "../src/powerManager.js";
import { ANIMBIT } from "../src/tileFlags";

describe("the power manager", () => {

    describe("when scanning a coal power plant", () => {

        const CENTRE_X = 50;
        const CENTRE_Y = 50;

        function scanPlant() {
            const map = new GameMap(120, 100);
            const powerManager = new PowerManager(map);
            powerManager.coalPowerFound(map, CENTRE_X, CENTRE_Y, {census: {coalPowerPop: 0}});
            return map;
        }

        it("should animate the four smokestack tiles", () => {
            const map = scanPlant();

            for (const [dx, dy] of [[1, -1], [2, -1], [1, 0], [2, 0]]) {
                expect(map.getTileFlags(CENTRE_X + dx, CENTRE_Y + dy) & ANIMBIT).toBe(ANIMBIT);
            }
        });

        it("should not animate the plant's top-left corner", () => {
            const map = scanPlant();

            expect(map.getTileFlags(CENTRE_X - 1, CENTRE_Y - 1) & ANIMBIT).toBe(0);
        });
    });
});
