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
import { EmergencyServices } from "../src/emergencyServices.js";
import { GameMap } from "../src/gameMap.js";
import { BNCNBIT, BULLBIT, POWERBIT, ZONEBIT } from "../src/tileFlags";
import { FIRESTATION, POLICESTATION, ROADS } from "../src/tileValues";
import { Traffic } from "../src/traffic.js";
import { registeredHandler } from "./helpers/handlers";

// A station's cover as doSpecialZone in the original's simulate.cpp notes it: its funded effect, halved when it has no
// power and again when it has no road, added to the block of the road tile its perimeter search finds first, or of
// the station when it has none
describe.each([
    ["police station", POLICESTATION, "policeStationMap", "policeEffect", "policeStationPop"],
    ["fire station", FIRESTATION, "fireStationMap", "fireEffect", "fireStationPop"],
] as const)("a %s", (_, station, mapName, effectName, popName) => {

    // The station's centre is in the block of 8 by 8 tiles at (1, 1). Its perimeter search tries (8, 7) first, then
    // (9, 7), both in the block above, and comes to (7, 10), in the block to the left, tenth of twelve.
    const X = 9;
    const Y = 9;
    const EFFECT = 1000;
    const FIRST: [number, number] = [8, 7];
    const SECOND: [number, number] = [9, 7];
    const TENTH: [number, number] = [7, 10];

    function scan(roads: [number, number][], powered: boolean) {
        const map = new GameMap(120, 100);
        map.setTile(X, Y, station, BNCNBIT | ZONEBIT | (powered ? POWERBIT : 0));
        for (const [x, y] of roads) {
            map.setTile(x, y, ROADS, BULLBIT);
        }

        const blockMap = new BlockMap(120, 100, 8);
        const simData = {
            blockMaps: {[mapName]: blockMap},
            budget: {[effectName]: EFFECT},
            census: {[popName]: 0},
            trafficManager: new Traffic(map, null, null),
        };
        registeredHandler(EmergencyServices.registerHandlers, station)(map, X, Y, simData);
        return {blockMap, census: simData.census};
    }

    it("is counted", () => {
        expect(scan([FIRST], true).census[popName]).toBe(1);
    });

    it("notes its full effect in the block of its road, not its own", () => {
        const {blockMap} = scan([FIRST], true);

        expect(blockMap.get(1, 0)).toBe(EFFECT);
        expect(blockMap.get(1, 1)).toBe(0);
    });

    it("notes its effect at a road its search comes to late, in another block", () => {
        const {blockMap} = scan([TENTH], true);

        expect(blockMap.get(0, 1)).toBe(EFFECT);
        expect(blockMap.get(1, 1)).toBe(0);
    });

    it("notes its effect at the road its search finds first, of two", () => {
        const {blockMap} = scan([TENTH, SECOND], true);

        expect(blockMap.get(1, 0)).toBe(EFFECT);
        expect(blockMap.get(0, 1)).toBe(0);
    });

    it("notes half its effect without power", () => {
        expect(scan([FIRST], false).blockMap.get(1, 0)).toBe(EFFECT / 2);
    });

    it("notes half its effect in its own block without a road", () => {
        expect(scan([], true).blockMap.get(1, 1)).toBe(EFFECT / 2);
    });

    it("notes a quarter of its effect with neither", () => {
        expect(scan([], false).blockMap.get(1, 1)).toBe(EFFECT / 4);
    });
});
