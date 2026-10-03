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
import { Residential } from "../src/residential.js";
import { BLBNCNBIT, BULLBIT, POWERBIT, ZONEBIT } from "../src/tileFlags";
import { TileUtils } from "../src/tileUtils.js";
import { Traffic } from "../src/traffic.js";
import { DIRT, FREEZ, HHTHR, HOUSE, LHTHR, ROADS, RZB } from "../src/tileValues";
import { ZoneUtils } from "../src/zoneUtils.js";
import { registeredHandler } from "./helpers/handlers";
import { streamAlwaysDrawing, streamDrawing } from "./helpers/streams";
import { makeMap, makeSimData } from "./helpers/zoneCity";

type TileHandler = (map: unknown, x: number, y: number, simData: unknown) => void;

// What a drive finds, which Traffic defines as properties its type leaves out
const Results = Traffic as unknown as {ROUTE_FOUND: number, NO_ROAD_FOUND: number};

const X = 50;
const Y = 50;
// The land value category of the zones, the highest, where the land is worth the most there is
const LAND_VALUE = 3;

function residentialHandler(): TileHandler {
    const handlers = new Map<unknown, TileHandler>();
    Residential.registerHandlers({addAction: (key: unknown, handler: TileHandler) => handlers.set(key, handler)},
                                 {addAction: () => undefined});
    return handlers.get(TileUtils.isResidentialZone)!;
}

// A powered zone of the density at (X, Y), scanned once with the stream given and a drive that ends as given:
// the map after
function scanZone(density: number, random: Random, traffic: number): InstanceType<typeof GameMap> {
    const map = new GameMap(120, 100);
    map.putZone(X, Y, RZB + 36 * LAND_VALUE + 9 * density, 3);
    map.addTileFlags(X, Y, POWERBIT);

    const landValueMap = new BlockMap(120, 100, 2);
    landValueMap.worldSet(X, Y, 250);
    const simData = {
        census: {resZonePop: 0, resPop: 0},
        blockMaps: {landValueMap, pollutionDensityMap: new BlockMap(120, 100, 2),
                    populationDensityMap: new BlockMap(120, 100, 2), rateOfGrowthMap: new BlockMap(120, 100, 8)},
        valves: {resValve: 2000},
        random,
        trafficManager: {makeTraffic: () => traffic},
    };

    residentialHandler()(map, X, Y, simData);
    return map;
}

function population(map: InstanceType<typeof GameMap>): number {
    return Residential.getZonePopulation(map, X, Y, map.getTileValue(X, Y));
}

describe("a built residential zone's population", () => {

    // As getResZonePop in the original: the zone's density, 0 to 3, counts 16, 24, 32 or 40, whatever its land value.
    // Each land value's variants run through the four densities, nine tiles to a zone.
    it.each([[0, 16], [1, 24], [2, 32], [3, 40]])("at density %i is %i, at each land value", (density, expected) => {
        const map = new GameMap(120, 100);

        for (let landValue = 0; landValue < 4; landValue++) {
            expect(Residential.getZonePopulation(map, 50, 50, RZB + 36 * landValue + 9 * density)).toBe(expected);
        }
    });
});

describe("a built residential zone", () => {

    // The draws: 35, so no drive is tried below the highest density; 0, so the zone is assessed; and the least signed
    // draw, so it grows
    it.each([[0, 24], [1, 32], [2, 40], [3, 40]])("at density %i grows to a population of %i", (density, expected) => {
        expect(population(scanZone(density, streamDrawing([35, 0, 0x8000]), Results.ROUTE_FOUND))).toBe(expected);
    });

    // Every draw 0, so a drive is tried, and finds no road
    it.each([[1, 16], [2, 24], [3, 32]])("at density %i with no road declines to a population of %i",
                                         (density, expected) => {
        expect(population(scanZone(density, streamAlwaysDrawing(0), Results.NO_ROAD_FOUND))).toBe(expected);
    });

    // As doResidentialOut in the original, the eight houses are built column by column, each drawing which of the
    // land value's three houses it is
    it("at the lowest density with no road declines to an empty zone of eight houses", () => {
        const houses = [0, 1, 2, 0, 1, 2, 0, 1];
        const map = scanZone(0, streamDrawing([0, ...houses]), Results.NO_ROAD_FOUND);

        const around = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        expect({value: map.getTileValue(X, Y), flags: map.getTileFlags(X, Y)})
            .toEqual({value: FREEZ, flags: BLBNCNBIT | ZONEBIT});
        expect(around.map(([dx, dy]) => [map.getTileValue(X + dx, Y + dy), map.getTileFlags(X + dx, Y + dy)]))
            .toEqual(houses.map((house) => [LHTHR + LAND_VALUE + house, BLBNCNBIT]));
    });
});

describe("a residential zone of single houses", () => {

    // A powered zone of single houses, with no house unless the test builds one, on land valuable enough, under demand
    // strong enough, for it to grow
    const ZONE_X = 20;
    const ZONE_Y = 20;
    const LAND_VALUE = 100;
    const STRONG_DEMAND = 2000;
    // The land value's grade, 80 to 149, and so the house's: HOUSE plus three per grade, plus the house's draw
    const HOUSE_GRADE = HOUSE + 2 * 3;

    // The 8 lots around the centre, in the order buildHouse in the original scans them
    const LOTS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
        .map(([dx, dy]) => ({x: ZONE_X + dx, y: ZONE_Y + dy}));
    const NORTH_WEST = 0;
    const EAST = 4;
    const SOUTH_EAST = 7;

    // The draws before buildHouse's: getRandom(35) of 35, over any population an empty zone has, so it doesn't drive;
    // and getRandom16Signed of -32767, under the zone's score, so it grows
    const BEFORE_BUILDING = [35, 0x8001];
    // getChance(3), drawn when the zone has no house yet, whose low bits set mean no hospital
    const NO_HOSPITAL = 1;
    // A tie draw that is not taken, its low three bits set, and one that is
    const NO_TIE = 1;
    const TIE = 0;
    // The house's draw, getRandom(2): which of its grade's three houses it is
    const FIRST_HOUSE = 0;
    const THIRD_HOUSE = 2;

    function makeCity() {
        const map = makeMap();
        ZoneUtils.putZone(map, ZONE_X, ZONE_Y, FREEZ, true);
        return map;
    }

    // Calls the zone's handler with the draws, and gives the lots that hold a house
    function grow(map: ReturnType<typeof makeMap>, draws: number[]) {
        const simData = makeSimData(map, streamDrawing([...BEFORE_BUILDING, ...draws]));
        simData.blockMaps.landValueMap.worldSet(ZONE_X, ZONE_Y, LAND_VALUE);
        simData.valves.resValve = STRONG_DEMAND;

        registeredHandler(Residential.registerHandlers, TileUtils.isResidentialZone)(map, ZONE_X, ZONE_Y, simData);

        return LOTS.flatMap((lot, i) => {
            const value = map.getTileValue(lot.x, lot.y);
            return value >= LHTHR && value <= HHTHR ? [{lot: i, value}] : [];
        });
    }

    // Every lot scores 1 and none draws a tie: the first lot scanned is the best. Scanning the centre too, as an empty
    // lot that also scores 1, kept the house from being built at all.
    it("should build on the first lot when every lot ties", () => {
        const houses = grow(makeCity(), [NO_HOSPITAL, ...Array(LOTS.length).fill(NO_TIE), FIRST_HOUSE]);

        expect(houses).toEqual([{lot: NORTH_WEST, value: HOUSE_GRADE}]);
    });

    // Every lot scores 1, and the last lot scanned takes its tie draw
    it("should build on a later lot that wins a tie", () => {
        const houses = grow(makeCity(), [NO_HOSPITAL, ...Array(LOTS.length - 1).fill(NO_TIE), TIE, FIRST_HOUSE]);

        expect(houses).toEqual([{lot: SOUTH_EAST, value: HOUSE_GRADE}]);
    });

    // As buildHouse in the original, the tie test is no else: the lot that has just become the best draws once, so
    // the house's own draw is the next one. Here the north-west lot alone scores 2, with a road beside it.
    it("should draw a tie for a lot as it becomes the best", () => {
        const map = makeCity();
        map.setTile(ZONE_X - 2, ZONE_Y - 1, ROADS, 0);

        const houses = grow(map, [NO_HOSPITAL, NO_TIE, THIRD_HOUSE]);

        expect(houses).toEqual([{lot: NORTH_WEST, value: HOUSE_GRADE + THIRD_HOUSE}]);
    });

    // As evalLot in the original, a lot of bare dirt is clear. The other seven lots hold houses, so the zone is not
    // empty and draws no hospital.
    it("should build on a lot of bare dirt", () => {
        const map = makeCity();
        LOTS.forEach((lot) => map.setTile(lot.x, lot.y, HOUSE, BLBNCNBIT));
        map.setTile(LOTS[EAST].x, LOTS[EAST].y, DIRT, 0);

        const houses = grow(map, [NO_TIE, FIRST_HOUSE]);

        expect(houses.filter((house) => house.lot === EAST)).toEqual([{lot: EAST, value: HOUSE_GRADE}]);
    });

    // The original compares the map word with DIRT, flags and all, so dirt with a flag counts as a road beside a lot.
    // The south-east lot alone has one, and scores 2.
    it("should count dirt with flags beside a lot as a road", () => {
        const map = makeCity();
        map.setTile(ZONE_X + 2, ZONE_Y + 1, DIRT, BULLBIT);

        const houses = grow(map, [NO_HOSPITAL, ...Array(LOTS.length).fill(NO_TIE), FIRST_HOUSE]);

        expect(houses).toEqual([{lot: SOUTH_EAST, value: HOUSE_GRADE}]);
    });
});
