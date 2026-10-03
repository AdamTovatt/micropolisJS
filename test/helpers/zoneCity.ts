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

// A city small enough to call one zone handler on, or to drive in: a map, the block maps the zone handlers and the
// traffic read and write, at the simulation's block sizes, and the simulation data a handler is given, with a stream
// whose draws the test chooses.

import { BlockMap } from "../../src/blockMap";
import { GameMap } from "../../src/gameMap.js";
import { Random } from "../../src/random";
import { Traffic } from "../../src/traffic.js";

export const WIDTH = 120;
export const HEIGHT = 100;

export function makeMap(): InstanceType<typeof GameMap> {
    return new GameMap(WIDTH, HEIGHT);
}

export function makeBlockMaps() {
    return {
        cityCentreDistScoreMap: new BlockMap(WIDTH, HEIGHT, 8),
        landValueMap: new BlockMap(WIDTH, HEIGHT, 2),
        pollutionDensityMap: new BlockMap(WIDTH, HEIGHT, 2),
        populationDensityMap: new BlockMap(WIDTH, HEIGHT, 2),
        rateOfGrowthMap: new BlockMap(WIDTH, HEIGHT, 8),
        trafficDensityMap: new BlockMap(WIDTH, HEIGHT, 2),
    };
}

export interface ZoneSimData {
    blockMaps: ReturnType<typeof makeBlockMaps>;
    census: Record<string, number>;
    random: Random;
    trafficManager: unknown;
    valves: {resValve: number, comValve: number, indValve: number};
}

// The data a handler on the map is given, drawing from the stream; the valves are neutral unless the test sets them
export function makeSimData(map: InstanceType<typeof GameMap>, random: Random): ZoneSimData {
    return {
        blockMaps: makeBlockMaps(),
        census: {resZonePop: 0, resPop: 0, comZonePop: 0, comPop: 0, indZonePop: 0, indPop: 0, hospitalPop: 0,
                 needHospital: 0},
        random,
        trafficManager: new Traffic(map, {getSprite: () => null}, random),
        valves: {resValve: 0, comValve: 0, indValve: 0},
    };
}
