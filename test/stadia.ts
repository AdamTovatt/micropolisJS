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
import { Stadia } from "../src/stadia.js";
import { ANIMBIT, BNCNBIT, POWERBIT, ZONEBIT } from "../src/tileFlags";
import { FOOTBALLGAME1, FOOTBALLGAME2, FULLSTADIUM, STADIUM } from "../src/tileValues";
import { registeredHandler } from "./helpers/handlers";

type GameMapInstance = InstanceType<typeof GameMap>;

// A stadium's games as doSpecialZone and drawStadium in the original's simulate.cpp hold them: one starts when the city
// time and the centre's position add up to a multiple of 32, and ends at a multiple of 8
describe("a stadium", () => {

    const X = 10;
    const Y = 10;

    function stadium(centre: number, powered: boolean): GameMapInstance {
        const map = new GameMap(120, 100);
        map.putZone(X, Y, centre, 4);
        if (powered) {
            map.addTileFlags(X, Y, POWERBIT);
        }

        return map;
    }

    function scan(map: GameMapInstance, centre: number, cityTime: number) {
        const census = {stadiumPop: 0};
        registeredHandler(Stadia.registerHandlers, centre)(map, X, Y, {census, cityTime});
        return census;
    }

    it("starts a game when powered, its centre powered and the pitch animated", () => {
        const map = stadium(STADIUM, true);

        const census = scan(map, STADIUM, 64 - X - Y);

        expect(census.stadiumPop).toBe(1);
        expect(map.getTileValue(X, Y)).toBe(FULLSTADIUM);
        expect(map.getTileFlags(X, Y)).toBe(BNCNBIT | ZONEBIT | POWERBIT);
        expect(map.getTile(X + 1, Y).getRawValue()).toBe(FOOTBALLGAME1 | ANIMBIT);
        expect(map.getTile(X + 1, Y + 1).getRawValue()).toBe(FOOTBALLGAME2 | ANIMBIT);
    });

    it("starts no game without power", () => {
        const map = stadium(STADIUM, false);

        scan(map, STADIUM, 64 - X - Y);

        expect(map.getTileValue(X, Y)).toBe(STADIUM);
    });

    it("starts no game between the times", () => {
        const map = stadium(STADIUM, true);

        scan(map, STADIUM, 65 - X - Y);

        expect(map.getTileValue(X, Y)).toBe(STADIUM);
    });

    it.each([
        ["powered", true],
        ["unpowered", false],
    ])("ends a game with its centre marked powered, %s before", (_, powered) => {
        const map = stadium(FULLSTADIUM, powered);

        const census = scan(map, FULLSTADIUM, 64 - X - Y);

        expect(census.stadiumPop).toBe(1);
        expect(map.getTileValue(X, Y)).toBe(STADIUM);
        expect(map.getTileFlags(X, Y)).toBe(BNCNBIT | ZONEBIT | POWERBIT);
    });

    it("plays on between the times", () => {
        const map = stadium(FULLSTADIUM, true);

        scan(map, FULLSTADIUM, 65 - X - Y);

        expect(map.getTileValue(X, Y)).toBe(FULLSTADIUM);
    });
});
