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
import { BLBNCNBIT, POWERBIT, ZONEBIT } from "../src/tileFlags";
import { TileUtils } from "../src/tileUtils.js";
import { Traffic } from "../src/traffic.js";
import { FREEZ, LHTHR, RZB } from "../src/tileValues";
import { streamAlwaysDrawing, streamDrawing } from "./helpers/streams";

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
