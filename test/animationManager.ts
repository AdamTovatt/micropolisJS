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

import { ANIMATION_PERIOD, AnimationManager, BLINK_PERIOD, isInSequence, nextAnimationFrame }
    from "../src/animationManager";
import { GameMap } from "../src/gameMap.js";
import { ANIMBIT, BULLBIT, POWERBIT, ZONEBIT } from "../src/tileFlags";
import { DIRT, FIRE, FOUNTAIN, FREEZ, LASTFIRE, LASTTINYEXP, LIGHTNINGBOLT, RADAR0, RADAR7, TILE_INVALID, TINYEXP }
    from "../src/tileValues";

const MAP_WIDTH = 120;
const MAP_HEIGHT = 100;

describe("the animation frames", () => {

    it("follow a tile that isn't animated with itself", () => {
        expect(nextAnimationFrame(DIRT)).toBe(DIRT);
        expect(nextAnimationFrame(FREEZ)).toBe(FREEZ);
    });

    it("step through a sequence", () => {
        expect(nextAnimationFrame(FIRE)).toBe(FIRE + 1);
        expect(nextAnimationFrame(RADAR0)).toBe(RADAR0 + 1);
    });

    it("loop back to the start of a looping sequence", () => {
        expect(nextAnimationFrame(LASTFIRE)).toBe(FIRE);
        expect(nextAnimationFrame(RADAR7)).toBe(RADAR0);
    });

    it("leave a base tile that doesn't recur in its sequence", () => {
        // Low traffic: the base tile 80 starts a sequence that cycles through 128, 112 and 96
        expect(nextAnimationFrame(80)).toBe(128);
        expect(nextAnimationFrame(96)).toBe(80);
        // A train-crossing tile's base, 621, enters a loop of 852 to 859 it never returns to
        expect(nextAnimationFrame(621)).toBe(852);
        expect(nextAnimationFrame(859)).toBe(852);
    });

    it("hold an explosion's last frame", () => {
        expect(nextAnimationFrame(TINYEXP)).toBe(TINYEXP + 1);
        expect(nextAnimationFrame(LASTTINYEXP)).toBe(LASTTINYEXP);
    });

    it("know each frame of a tile's sequence", () => {
        for (let frame = FIRE + 1; frame <= LASTFIRE; frame++) {
            expect(isInSequence(FIRE, frame)).toBe(true);
        }
        expect(isInSequence(621, 859)).toBe(true);
    });

    it("know a frame of another sequence isn't the tile's", () => {
        expect(isInSequence(FIRE, RADAR0)).toBe(false);
        expect(isInSequence(621, 80)).toBe(false);
    });

    it("know a tile that isn't animated has no sequence", () => {
        expect(isInSequence(DIRT, DIRT)).toBe(false);
        expect(isInSequence(DIRT, FIRE)).toBe(false);
    });
});

describe("the animation manager", () => {

    beforeEach(() => {
        jest.useFakeTimers({now: new Date(2026, 0, 1)});
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // A manager for a map of the usual size: it reads only the map's extent
    function newManager(): AnimationManager {
        return new AnimationManager({width: MAP_WIDTH, height: MAP_HEIGHT});
    }

    // The tile painted for a raw tile value at (0, 0) of a 1x1 view
    function paintOne(animationManager: AnimationManager, rawValue: number, isPaused = false): number {
        const tileValues = [rawValue];
        animationManager.getTiles(tileValues, 0, 0, 1, 1, isPaused);
        return tileValues[0];
    }

    describe("painting tiles", () => {

        it("strips the flags from a tile that isn't animated", () => {
            expect(paintOne(newManager(), DIRT | BULLBIT)).toBe(DIRT);
        });

        it("leaves the void as it is", () => {
            expect(paintOne(newManager(), TILE_INVALID)).toBe(TILE_INVALID);
        });

        it("leaves tiles off the map's west edge as they are", () => {
            const tileValues = [FIRE | ANIMBIT, FIRE | ANIMBIT];

            newManager().getTiles(tileValues, -1, 0, 2, 1);

            expect(tileValues).toEqual([FIRE | ANIMBIT, FIRE + 1]);
        });

        it("leaves tiles off the map's east edge as they are", () => {
            const tileValues = [FIRE | ANIMBIT, FIRE | ANIMBIT];

            newManager().getTiles(tileValues, MAP_WIDTH - 1, 0, 2, 1);

            expect(tileValues).toEqual([FIRE + 1, FIRE | ANIMBIT]);
        });

        it("leaves tiles off the map's south edge as they are", () => {
            const tileValues = [FIRE | ANIMBIT, FIRE | ANIMBIT];

            newManager().getTiles(tileValues, 0, MAP_HEIGHT - 1, 1, 2);

            expect(tileValues).toEqual([FIRE + 1, FIRE | ANIMBIT]);
        });

        it("paints each tile of a view in rows, and carries on each one's animation", () => {
            const animationManager = newManager();
            // A view three tiles wide and two high
            const view = [FIRE | ANIMBIT, DIRT | BULLBIT, RADAR0 | ANIMBIT,
                          FREEZ | ZONEBIT | POWERBIT, LASTFIRE | ANIMBIT, FOUNTAIN | ANIMBIT];

            const first = view.slice();
            animationManager.getTiles(first, 0, 0, 3, 2);
            jest.advanceTimersByTime(ANIMATION_PERIOD + 1);
            const second = view.slice();
            animationManager.getTiles(second, 0, 0, 3, 2);

            expect(first).toEqual([FIRE + 1, DIRT, RADAR0 + 1, FREEZ, FIRE, FOUNTAIN + 1]);
            expect(second).toEqual([FIRE + 2, DIRT, RADAR0 + 2, FREEZ, FIRE + 1, FOUNTAIN + 2]);
        });

        it("advances an animation once per period", () => {
            const animationManager = newManager();
            const painted = [paintOne(animationManager, FIRE | ANIMBIT)];

            jest.advanceTimersByTime(ANIMATION_PERIOD);
            painted.push(paintOne(animationManager, FIRE | ANIMBIT));
            jest.advanceTimersByTime(1);
            painted.push(paintOne(animationManager, FIRE | ANIMBIT));

            expect(painted).toEqual([FIRE + 1, FIRE + 1, FIRE + 2]);
        });

        it("holds the frame while paused", () => {
            const animationManager = newManager();
            paintOne(animationManager, FIRE | ANIMBIT);

            jest.advanceTimersByTime(ANIMATION_PERIOD * 4);

            expect(paintOne(animationManager, FIRE | ANIMBIT, true)).toBe(FIRE + 1);
        });

        it("restarts an animation whose tile changed", () => {
            const animationManager = newManager();
            paintOne(animationManager, FIRE | ANIMBIT);
            jest.advanceTimersByTime(ANIMATION_PERIOD + 1);

            expect(paintOne(animationManager, RADAR0 | ANIMBIT)).toBe(RADAR0 + 1);
        });

        it("blinks an unpowered zone's centre with the lightning bolt", () => {
            const animationManager = newManager();
            const painted = [paintOne(animationManager, FREEZ | ZONEBIT)];

            jest.advanceTimersByTime(BLINK_PERIOD + 1);
            painted.push(paintOne(animationManager, FREEZ | ZONEBIT));
            jest.advanceTimersByTime(BLINK_PERIOD + 1);
            painted.push(paintOne(animationManager, FREEZ | ZONEBIT));

            expect(painted).toEqual([LIGHTNINGBOLT, FREEZ, LIGHTNINGBOLT]);
        });

        it("keeps blinking an unpowered zone while paused", () => {
            const animationManager = newManager();
            const painted = [paintOne(animationManager, FREEZ | ZONEBIT, true)];

            jest.advanceTimersByTime(BLINK_PERIOD + 1);
            painted.push(paintOne(animationManager, FREEZ | ZONEBIT, true));

            expect(painted).toEqual([LIGHTNINGBOLT, FREEZ]);
        });

        it("doesn't blink a powered zone", () => {
            expect(paintOne(newManager(), FREEZ | ZONEBIT | POWERBIT)).toBe(FREEZ);
        });
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

        it("plays its frames, then holds the last one", () => {
            const map = new GameMap(120, 100);
            map.setTile(X, Y, TINYEXP, ANIMBIT | BULLBIT);

            const painted = paint(map, 10);

            expect(painted).toEqual([861, 862, 863, 864, 865, 866, LASTTINYEXP, LASTTINYEXP, LASTTINYEXP, LASTTINYEXP]);
        });

        it("leaves the explosion in the map for the simulation to clear", () => {
            const map = new GameMap(120, 100);
            map.setTile(X, Y, TINYEXP, ANIMBIT | BULLBIT);

            paint(map, 10);

            expect(map.getTileValue(X, Y)).toBe(TINYEXP);
            expect(map.getTileFlags(X, Y)).toBe(ANIMBIT | BULLBIT);
        });
    });
});
