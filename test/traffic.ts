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
import { Random } from "../src/random";
import { TileUtils } from "../src/tileUtils.js";
import { COMBASE, DIRT, ROADS } from "../src/tileValues";
import { Traffic } from "../src/traffic.js";

jest.mock("../src/random");

// traffic.js defines its results with Object.defineProperties, so the type inferred from it lacks them
const Results = Traffic as unknown as {ROUTE_FOUND: number, NO_ROUTE_FOUND: number};

describe("traffic", () => {

    // A straight east-west road from (10, 10) to (20, 10), with a destination north of (15, 10). The zone at
    // (11, 12) has the road's west end on its perimeter.
    const ROAD_Y = 10;
    const DESTINATION_X = 15;
    const ZONE_X = 11;
    const ZONE_Y = 12;

    // Each trip adds this much to the density of the road it remembers
    const TRIP_DENSITY = 50;

    function makeMap(destinationTile: number) {
        const map = new GameMap(120, 100);
        for (let x = 10; x <= 20; x++) {
            map.setTile(x, ROAD_Y, ROADS, 0);
        }
        map.setTile(DESTINATION_X, ROAD_Y - 1, destinationTile, 0);
        return map;
    }

    function makeBlockMaps() {
        return {trafficDensityMap: new BlockMap(120, 100, 2)};
    }

    it("should find a route along a road to a destination", () => {
        const traffic = new Traffic(makeMap(COMBASE), null);

        const result = traffic.makeTraffic(ZONE_X, ZONE_Y, makeBlockMaps(), TileUtils.isCommercial);

        expect(result).toBe(Results.ROUTE_FOUND);
    });

    it("should add the route to the traffic density map", () => {
        const traffic = new Traffic(makeMap(COMBASE), null);
        const blockMaps = makeBlockMaps();

        traffic.makeTraffic(ZONE_X, ZONE_Y, blockMaps, TileUtils.isCommercial);

        // Every second tile of the drive east from (10, 10) is remembered
        expect(blockMaps.trafficDensityMap.worldGet(12, ROAD_Y)).toBe(TRIP_DENSITY);
        expect(blockMaps.trafficDensityMap.worldGet(14, ROAD_Y)).toBe(TRIP_DENSITY);
    });

    it("should report no route when the road leads nowhere", () => {
        const traffic = new Traffic(makeMap(DIRT), null);

        const result = traffic.makeTraffic(ZONE_X, ZONE_Y, makeBlockMaps(), TileUtils.isCommercial);

        expect(result).toBe(Results.NO_ROUTE_FOUND);
    });

    describe("at a junction", () => {

        // A branch runs south from (13, 10) to a dead end at (13, 15). The main road still leads to the destination.
        const JUNCTION_X = 13;

        function makeJunctionMap() {
            const map = makeMap(COMBASE);
            for (let y = ROAD_Y + 1; y <= ROAD_Y + 5; y++) {
                map.setTile(JUNCTION_X, y, ROADS, 0);
            }
            return map;
        }

        // At the junction the open roads are east, then south, in clockwise order from north
        it("should reach the destination when it picks the road leading there", () => {
            (Random.getRandom as jest.Mock).mockReturnValue(0);
            const traffic = new Traffic(makeJunctionMap(), null);

            const result = traffic.makeTraffic(ZONE_X, ZONE_Y, makeBlockMaps(), TileUtils.isCommercial);

            expect(result).toBe(Results.ROUTE_FOUND);
        });

        it("should give up when it picks the dead end", () => {
            (Random.getRandom as jest.Mock).mockReturnValue(1);
            const traffic = new Traffic(makeJunctionMap(), null);

            const result = traffic.makeTraffic(ZONE_X, ZONE_Y, makeBlockMaps(), TileUtils.isCommercial);

            expect(result).toBe(Results.NO_ROUTE_FOUND);
        });
    });
});
