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

import { streamDrawing } from "./helpers/streams";
import { makeBlockMaps, makeMap } from "./helpers/zoneCity";
import { COMBASE, DIRT, FREEZ, HOSPITAL, HOUSE, INDBASE, LHTHR, NUCLEAR, PORT, ROADS } from "../src/tileValues";
import { Traffic } from "../src/traffic.js";


interface Destination {
    low: number;
    high: number;
}

// traffic.js defines its results and destinations with Object.defineProperties, so the type inferred from it lacks them
const Results = Traffic as unknown as {ROUTE_FOUND: number, NO_ROUTE_FOUND: number, COMMERCIAL: Destination,
                                       INDUSTRIAL: Destination, RESIDENTIAL: Destination, MAX_TRAFFIC_DENSITY: number,
                                       TRIP_TRAFFIC: number};

describe("traffic", () => {

    // A straight east-west road from (10, 10) to (20, 10), with a destination north of (15, 10). The zone at
    // (11, 12) has the road's west end on its perimeter.
    const ROAD_Y = 10;
    const DESTINATION_X = 15;
    const ZONE_X = 11;
    const ZONE_Y = 12;

    function makeRoadMap(destinationTile: number) {
        const map = makeMap();
        for (let x = 10; x <= 20; x++) {
            map.setTile(x, ROAD_Y, ROADS, 0);
        }
        map.setTile(DESTINATION_X, ROAD_Y - 1, destinationTile, 0);
        return map;
    }

    it("should find a route along a road to a destination", () => {
        const traffic = new Traffic(makeRoadMap(COMBASE), null, streamDrawing([]));

        const result = traffic.makeTraffic(ZONE_X, ZONE_Y, makeBlockMaps(), Results.COMMERCIAL);

        expect(result).toBe(Results.ROUTE_FOUND);
    });

    it("should add the route to the traffic density map", () => {
        const traffic = new Traffic(makeRoadMap(COMBASE), null, streamDrawing([]));
        const blockMaps = makeBlockMaps();

        traffic.makeTraffic(ZONE_X, ZONE_Y, blockMaps, Results.COMMERCIAL);

        // Every second tile of the drive east from (10, 10) is remembered
        expect(blockMaps.trafficDensityMap.worldGet(12, ROAD_Y)).toBe(Results.TRIP_TRAFFIC);
        expect(blockMaps.trafficDensityMap.worldGet(14, ROAD_Y)).toBe(Results.TRIP_TRAFFIC);
    });

    // A drive that takes a block to its heaviest traffic draws 0 to 5, and a 0 points the helicopter at the block. The
    // block of (14, 10) is the one of the drive's that starts near its heaviest, so the drive draws once.
    describe("at the heaviest traffic", () => {
        // Traffic one drive takes past the heaviest a block holds
        const HEAVY = Results.MAX_TRAFFIC_DENSITY - Results.TRIP_TRAFFIC + 10;
        const HELICOPTER_DRAW = 0;
        const NO_HELICOPTER_DRAW = 1;

        function driveWithHelicopter(draw: number) {
            const helicopter = {destX: 0, destY: 0};
            const traffic = new Traffic(makeRoadMap(COMBASE), {getSprite: () => helicopter}, streamDrawing([draw]));
            const blockMaps = makeBlockMaps();
            blockMaps.trafficDensityMap.worldSet(14, ROAD_Y, HEAVY);

            traffic.makeTraffic(ZONE_X, ZONE_Y, blockMaps, Results.COMMERCIAL);

            expect(blockMaps.trafficDensityMap.worldGet(14, ROAD_Y)).toBe(Results.MAX_TRAFFIC_DENSITY);
            return helicopter;
        }

        it("should point the helicopter at the block on a draw of 0", () => {
            expect(driveWithHelicopter(HELICOPTER_DRAW)).toEqual({destX: 14 * 16, destY: ROAD_Y * 16});
        });

        it("should leave the helicopter alone on any other draw", () => {
            expect(driveWithHelicopter(NO_HELICOPTER_DRAW)).toEqual({destX: 0, destY: 0});
        });
    });

    it("should report no route when the road leads nowhere", () => {
        const traffic = new Traffic(makeRoadMap(DIRT), null, streamDrawing([]));

        const result = traffic.makeTraffic(ZONE_X, ZONE_Y, makeBlockMaps(), Results.COMMERCIAL);

        expect(result).toBe(Results.NO_ROUTE_FOUND);
    });

    // As driveDone in the original: each destination is a range of tile values, wider than its kind of zone
    describe("destinations", () => {

        function drive(destinationTile: number, destination: Destination) {
            const traffic = new Traffic(makeRoadMap(destinationTile), null, streamDrawing([]));
            return traffic.makeTraffic(ZONE_X, ZONE_Y, makeBlockMaps(), destination);
        }

        it.each([
            ["commercial", COMBASE],
            ["industry", INDBASE],
            ["the seaport", PORT],
            ["the nuclear plant's centre", NUCLEAR],
        ])("should end a drive to commercial at %s", (_, tile) => {
            expect(drive(tile, Results.COMMERCIAL)).toBe(Results.ROUTE_FOUND);
        });

        it.each([
            ["a house", HOUSE],
            ["a hospital", HOSPITAL],
            ["commercial", COMBASE],
            ["the seaport's centre", PORT],
        ])("should end a drive to industry at %s", (_, tile) => {
            expect(drive(tile, Results.INDUSTRIAL)).toBe(Results.ROUTE_FOUND);
        });

        it.each([
            ["a house", HOUSE],
            ["a hospital", HOSPITAL],
            ["the first commercial tile", COMBASE],
        ])("should end a drive to residential at %s", (_, tile) => {
            expect(drive(tile, Results.RESIDENTIAL)).toBe(Results.ROUTE_FOUND);
        });

        // Each just outside its range, at either end
        it.each([
            ["commercial at the tile before commercial's first", Results.COMMERCIAL, COMBASE - 1],
            ["commercial at the nuclear plant past its centre", Results.COMMERCIAL, NUCLEAR + 1],
            ["industry at an empty residential zone's last tile", Results.INDUSTRIAL, LHTHR - 1],
            ["industry at the seaport past its centre", Results.INDUSTRIAL, PORT + 1],
            ["residential at an empty residential zone's last tile", Results.RESIDENTIAL, LHTHR - 1],
            ["residential at an empty residential zone", Results.RESIDENTIAL, FREEZ],
            ["residential at commercial past its first tile", Results.RESIDENTIAL, COMBASE + 1],
            ["commercial at a house", Results.COMMERCIAL, HOUSE],
        ])("should not end a drive to %s", (_, destination, tile) => {
            expect(drive(tile, destination)).toBe(Results.NO_ROUTE_FOUND);
        });
    });

    describe("at a junction", () => {

        // A branch runs south from (13, 10) to a dead end at (13, 15). The main road still leads to the destination.
        const JUNCTION_X = 13;

        function makeJunctionMap() {
            const map = makeRoadMap(COMBASE);
            for (let y = ROAD_Y + 1; y <= ROAD_Y + 5; y++) {
                map.setTile(JUNCTION_X, y, ROADS, 0);
            }
            return map;
        }

        // At the junction, arriving from the west, the open roads are east and south. As tryGo in the original, the
        // draw's low two bits pick one of the four directions clockwise from north, 0 to 3, and a closed one gives way
        // to the next open one clockwise.
        it.each([
            ["east", 1],
            ["north, closed, giving way to east", 0],
            ["west, the way back, giving way through north to east", 3],
            ["east, from the draw's low bits alone", 0x100 | 1],
        ])("should reach the destination when the draw picks %s", (_, draw) => {
            const traffic = new Traffic(makeJunctionMap(), null, streamDrawing([draw]));

            const result = traffic.makeTraffic(ZONE_X, ZONE_Y, makeBlockMaps(), Results.COMMERCIAL);

            expect(result).toBe(Results.ROUTE_FOUND);
        });

        it("should give up when the draw picks the dead end to the south", () => {
            const traffic = new Traffic(makeJunctionMap(), null, streamDrawing([2]));

            const result = traffic.makeTraffic(ZONE_X, ZONE_Y, makeBlockMaps(), Results.COMMERCIAL);

            expect(result).toBe(Results.NO_ROUTE_FOUND);
        });
    });
});
