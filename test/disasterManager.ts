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
import { EARTHQUAKE, PLANE_CRASHED } from "../src/messages";
import { Random } from "../src/random";
import { Simulation } from "../src/simulation.js";
import { SPRITE_AIRPLANE } from "../src/spriteConstants";
import { SpriteManager } from "../src/spriteManager.js";
import { BLBNBIT, BULLBIT, BURNBIT } from "../src/tileFlags";
import {
    DIRT, FIRE, FIRSTRIVEDGE, FLOOD, HOUSE, LASTFIRE, LASTRUBBLE, RADTILE, RIVER, RUBBLE, WOODS, WOODS5,
} from "../src/tileValues";
import { streamAlwaysDrawing, streamDrawing } from "./helpers/streams";


describe("the disaster manager", () => {

    // A draw of 1 is no disaster at any level, so the manager draws once and stops
    it.each([
        ["easy", Simulation.LEVEL_EASY, 480],
        ["medium", Simulation.LEVEL_MED, 240],
        ["hard", Simulation.LEVEL_HARD, 60],
    ])("draws a disaster's chance from the %s level's odds", (_, level, odds) => {
        const stream = streamAlwaysDrawing(1);
        const getRandom = jest.spyOn(stream, "getRandom");
        const manager = new DisasterManager(new GameMap(120, 100), null, stream);
        manager.disastersEnabled = true;

        manager.doDisasters(level, null);

        expect(getRandom.mock.calls).toEqual([[odds]]);
    });

    describe("when starting a flood", () => {

        // Every attempt to find water lands on the river edge, which floods its neighbours
        const RIVER_EDGE_X = 10;
        const RIVER_EDGE_Y = 10;
        const NEIGHBOURS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

        function makeDisasterManager(map: InstanceType<typeof GameMap>) {
            return new DisasterManager(map, null, streamAlwaysDrawing(RIVER_EDGE_X));
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

    // A flood spreading as doFlood in the original's disasters.cpp spreads it: while the flood lasts, each neighbour
    // that burns, is bare dirt, or is from the last of the woods, WOODS5, to the last rubble floods on one chance in 8
    describe("when a flood spreads", () => {

        const X = 10;
        const Y = 10;
        const NORTH: [number, number] = [X, Y - 1];

        // Every draw is 0: each neighbour is tried, and floods as FLOOD
        function spread(neighbourValue: number, neighbourFlags: number) {
            const map = new GameMap(120, 100);
            map.setTile(X, Y, FLOOD, 0);
            map.setTile(...NORTH, neighbourValue, neighbourFlags);
            const manager = new DisasterManager(map, null, streamAlwaysDrawing(0));
            manager.load({disasters: {floodCount: 30, disastersEnabled: false}});

            manager.doFlood(X, Y, null);

            return map.getTile(...NORTH).getRawValue();
        }

        it.each([
            ["bare dirt", DIRT, 0],
            ["woods that burn", WOODS, BLBNBIT],
            ["the last of the woods, though it doesn't burn", WOODS5, 0],
            ["the last rubble, just below a flood", FLOOD - 1, 0],
        ])("should flood %s", (_, value, flags) => {
            expect(spread(value, flags)).toBe(FLOOD);
        });

        it.each([
            ["dirt that carries flags", DIRT, BULLBIT],
            ["the river", RIVER, 0],
            ["woods just before the last, that don't burn", WOODS5 - 1, 0],
            ["a flood", FLOOD, 0],
        ])("should not flood %s", (_, value, flags) => {
            expect(spread(value, flags)).toBe(value | flags);
        });
    });

    // Every tile the stream draws is (10, 10)
    describe("when setting a fire", () => {

        function managerOver(value: number, flags: number) {
            const map = new GameMap(120, 100);
            map.setTile(10, 10, value, flags);
            const random = streamAlwaysDrawing(10);
            return {map, manager: new DisasterManager(map, new SpriteManager(map, random), random)};
        }

        const burning = (map: InstanceType<typeof GameMap>) => {
            const value = map.getTileValue(10, 10);
            return value >= FIRE && value <= LASTFIRE;
        };

        it.each([
            ["woods", WOODS, BLBNBIT, false],
            ["a house", HOUSE + 1, BURNBIT, true],
        ])("burns %s at random only if it is a building", (_, value, flags, burns) => {
            const {map, manager} = managerOver(value, flags);

            manager.setFire();

            expect(burning(map)).toBe(burns);
        });

        it.each([
            ["rubble, which cannot burn", RUBBLE, BULLBIT, false],
            ["woods", WOODS, BLBNBIT, true],
        ])("burns %s when the player sets one only if it can burn", (_, value, flags, burns) => {
            const {map, manager} = managerOver(value, flags);

            manager.makeFire();

            expect(burning(map)).toBe(burns);
        });
    });

    // The stream's every draw is 13: a strength of 313, and every tile drawn at (13, 13), which a house stands on. The
    // first strike sets it on fire, as one strike in four does, with the fire tile a draw of 13 picks, the sixth of the
    // eight; after that it is no building, and the strikes leave it.
    it("shakes the city centre, burning the first building it strikes", () => {
        const map = new GameMap(120, 100);
        map.setTile(13, 13, HOUSE, BURNBIT);
        const random = streamAlwaysDrawing(13);
        const manager = new DisasterManager(map, new SpriteManager(map, random), random);
        const heard: unknown[] = [];
        manager.addEventListener(EARTHQUAKE, (data: unknown) => heard.push(data));

        manager.makeEarthquake();

        expect(heard).toEqual([{showable: true, x: 60, y: 50}]);
        expect(map.getTileValue(13, 13)).toBe(FIRE + 5);
    });

    // A city of houses, where every strike lands on a building until it has struck there before
    it("leaves rubble three strikes in four, and fire the fourth", () => {
        const map = new GameMap(120, 100);
        for (let x = 0; x < map.width; x++) {
            for (let y = 0; y < map.height; y++) {
                map.setTile(x, y, HOUSE, BURNBIT);
            }
        }
        const random = Random.simulationStream(7);

        new DisasterManager(map, new SpriteManager(map, random), random).makeEarthquake();

        const struck = {rubble: 0, fire: 0};
        for (let x = 0; x < map.width; x++) {
            for (let y = 0; y < map.height; y++) {
                const value = map.getTileValue(x, y);
                if (value >= RUBBLE && value <= LASTRUBBLE) {
                    struck.rubble++;
                } else if (value >= FIRE && value <= LASTFIRE) {
                    struck.fire++;
                }
            }
        }
        expect(struck.rubble).toBeGreaterThan(2 * struck.fire);
        expect(struck.fire).toBeGreaterThan(0);
    });

    // Every draw is 5. The plane made for tile (15, 10) starts 48 pixels east and 12 south of it, at (288, 172), and
    // explodes at its hot spot, 48 east and 16 south of that: (336, 188), in tile (21, 11).
    it("crashes a plane over the land away from the map's edges when none flies", () => {
        const map = new GameMap(120, 100);
        const random = streamAlwaysDrawing(5);
        const spriteManager = new SpriteManager(map, random);
        const crashes: unknown[] = [];
        spriteManager.addEventListener(PLANE_CRASHED, (data: unknown) => crashes.push(data));

        new DisasterManager(map, spriteManager, random).makeCrash();

        expect(crashes).toEqual([{showable: true, x: 21, y: 11}]);
    });

    // A stream that fails the test if it is drawn from
    it("crashes the plane in the air, drawing nothing, when one flies", () => {
        const map = new GameMap(120, 100);
        const random = streamDrawing([]);
        const spriteManager = new SpriteManager(map, random);
        spriteManager.generatePlane(15, 10);
        const crashes: unknown[] = [];
        spriteManager.addEventListener(PLANE_CRASHED, (data: unknown) => crashes.push(data));

        new DisasterManager(map, spriteManager, random).makeCrash();

        expect(crashes).toEqual([{showable: true, x: 21, y: 11}]);
        expect(spriteManager.getSprite(SPRITE_AIRPLANE)).toBeNull();
    });

    // Only dirt without flags counts as dirt, as in the original
    describe.each([
        ["bare dirt", 0, RADTILE],
        ["dirt with a flag", BULLBIT, DIRT],
    ])("after a meltdown, on %s", (_, flags, left) => {

        // A meltdown at (50, 50), with every draw 20: the radiation falls 20 tiles east of 20 west, and 20 south of 15
        // north, on (50, 55)
        it(`leaves ${left === RADTILE ? "radiation" : "the dirt"}`, () => {
            const map = new GameMap(120, 100);
            map.setTile(50, 55, DIRT, flags);
            const random = streamAlwaysDrawing(20);
            const manager = new DisasterManager(map, new SpriteManager(map, random), random);

            manager.doMeltdown(50, 50);

            expect(map.getTileValue(50, 55)).toBe(left);
        });
    });
});
