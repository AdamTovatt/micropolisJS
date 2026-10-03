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

import { AnimationManager } from "../src/animationManager.js";
import { GameMap } from "../src/gameMap.js";
import { ANIMBIT, BULLBIT } from "../src/tileFlags";
import { LASTTINYEXP, TINYEXP } from "../src/tileValues";

// The manager's default animation period, in milliseconds
const ANIMATION_PERIOD = 50;

describe("the animation manager", () => {

    beforeEach(() => {
        jest.useFakeTimers({now: new Date(2026, 0, 1)});
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe("painting an explosion", () => {

        const X = 10;
        const Y = 10;

        // The frames painted for the tile at (X, Y) over the given number of animation periods
        function paint(map: InstanceType<typeof GameMap>, periods: number) {
            const animationManager = new AnimationManager(map);
            const painted: number[] = [];

            for (let i = 0; i < periods; i++) {
                const tileValues = [map.getTile(X, Y).getRawValue()];
                animationManager.getTiles(tileValues, X, Y, 1, 1);
                painted.push(tileValues[0]);
                jest.advanceTimersByTime(ANIMATION_PERIOD + 1);
            }

            return painted;
        }

        it("should play its frames, then hold the last one", () => {
            const map = new GameMap(120, 100);
            map.setTile(X, Y, TINYEXP, ANIMBIT | BULLBIT);

            const painted = paint(map, 10);

            expect(painted).toEqual([861, 862, 863, 864, 865, 866, LASTTINYEXP, LASTTINYEXP, LASTTINYEXP, LASTTINYEXP]);
        });

        it("should leave the explosion in the map for the simulation to clear", () => {
            const map = new GameMap(120, 100);
            map.setTile(X, Y, TINYEXP, ANIMBIT | BULLBIT);

            paint(map, 10);

            expect(map.getTileValue(X, Y)).toBe(TINYEXP);
            expect(map.getTileFlags(X, Y)).toBe(ANIMBIT | BULLBIT);
        });
    });
});
