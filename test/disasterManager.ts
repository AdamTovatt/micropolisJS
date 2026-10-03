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
import { Simulation } from "../src/simulation.js";
import { BLBNBIT, BULLBIT } from "../src/tileFlags";
import { DIRT, FIRSTRIVEDGE, FLOOD, RIVER, RUBBLE, WOODS, WOODS5 } from "../src/tileValues";
import { streamAlwaysDrawing } from "./helpers/streams";


describe("the disaster manager", () => {

    // A draw of 1 is no disaster at any level, so the manager draws once and stops
    it.each([
        ["easy", Simulation.LEVEL_EASY, 479],
        ["medium", Simulation.LEVEL_MED, 239],
        ["hard", Simulation.LEVEL_HARD, 59],
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
});
