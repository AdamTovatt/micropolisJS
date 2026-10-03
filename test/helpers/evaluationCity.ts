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

import { BlockMap } from "../../src/blockMap";
import { Budget } from "../../src/budget.js";
import { Census } from "../../src/census.js";
import { Evaluation } from "../../src/evaluation.js";
import { Random } from "../../src/random";
import { Valves } from "../../src/valves.js";

// Runs the port's yearly evaluation on a small city whose census, budget, valves and block maps a test sets year by
// year. The inputs are named as the census, budget and valves name them.

export const MAP_WIDTH = 16;
export const MAP_HEIGHT = 16;
export const BLOCK_SIZE = 2;
export const BLOCKS = (MAP_WIDTH / BLOCK_SIZE) * (MAP_HEIGHT / BLOCK_SIZE);

// One year's inputs to the evaluation
export interface Year {
    resPop: number; comPop: number; indPop: number;
    crimeAverage: number; pollutionAverage: number; landValueAverage: number;
    cityTax: number; firePop: number;
    roadEffect: number; policeEffect: number; fireEffect: number;
    resCap: boolean; comCap: boolean; indCap: boolean;
    resValve: number; comValve: number; indValve: number;
    poweredZoneCount: number; unpoweredZoneCount: number;
    // One value per block, row by row
    landValue: number[]; traffic: number[];
}

// The block a map position falls in
export function blockAt(values: number[], x: number, y: number): number {
    return values[Math.trunc(y / BLOCK_SIZE) * (MAP_WIDTH / BLOCK_SIZE) + Math.trunc(x / BLOCK_SIZE)];
}

// The stream only drives the opinion poll and the problem votes, never the score
export function newEvaluation() {
    return new Evaluation(Random.fromSeed(1));
}

export function makeCity() {
    return {
        blockMaps: {
            landValueMap: new BlockMap(MAP_WIDTH, MAP_HEIGHT, BLOCK_SIZE),
            trafficDensityMap: new BlockMap(MAP_WIDTH, MAP_HEIGHT, BLOCK_SIZE),
        },
        budget: new Budget(),
        census: new Census(),
        evaluation: newEvaluation(),
        valves: new Valves(),
    };
}

export type City = ReturnType<typeof makeCity>;

// Sets up one year's census, budget, valves and block maps, then runs the yearly evaluation
export function evaluateYear(city: City, year: Year): void {
    const {blockMaps, budget, census, evaluation, valves} = city;

    Object.assign(census, {
        resPop: year.resPop, comPop: year.comPop, indPop: year.indPop, totalPop: year.resPop + year.comPop + year.indPop,
        crimeAverage: year.crimeAverage, pollutionAverage: year.pollutionAverage,
        landValueAverage: year.landValueAverage, firePop: year.firePop,
        poweredZoneCount: year.poweredZoneCount, unpoweredZoneCount: year.unpoweredZoneCount,
    });
    for (let x = 0; x < MAP_WIDTH; x += BLOCK_SIZE) {
        for (let y = 0; y < MAP_HEIGHT; y += BLOCK_SIZE) {
            blockMaps.landValueMap.worldSet(x, y, blockAt(year.landValue, x, y));
            blockMaps.trafficDensityMap.worldSet(x, y, blockAt(year.traffic, x, y));
        }
    }
    Object.assign(budget, {
        cityTax: year.cityTax, roadEffect: year.roadEffect, policeEffect: year.policeEffect,
        fireEffect: year.fireEffect,
    });
    Object.assign(valves, {
        resCap: year.resCap, comCap: year.comCap, indCap: year.indCap,
        resValve: year.resValve, comValve: year.comValve, indValve: year.indValve,
    });

    evaluation.cityEvaluation({blockMaps, budget, census, valves});
}

const FULL_FUNDING = new Budget();

// A year without problems: no crime, pollution, land value, traffic, fires or tax, full funding, uncapped valves,
// every zone powered, and as many residents as jobs. Its base score is 1000, so each step's points can be worked out
// by hand. It has (resPop + resPop) * 20 people, and resPop is a multiple of 8.
export function problemFreeYear(resPop: number, changes: Partial<Year> = {}): Year {
    return {
        resPop, comPop: resPop / 8, indPop: 0,
        crimeAverage: 0, pollutionAverage: 0, landValueAverage: 0, cityTax: 0, firePop: 0,
        roadEffect: FULL_FUNDING.MAX_ROAD_EFFECT, policeEffect: FULL_FUNDING.MAX_POLICESTATION_EFFECT,
        fireEffect: FULL_FUNDING.MAX_FIRESTATION_EFFECT,
        resCap: false, comCap: false, indCap: false, resValve: 0, comValve: 0, indValve: 0,
        poweredZoneCount: 10, unpoweredZoneCount: 0,
        landValue: new Array(BLOCKS).fill(0), traffic: new Array(BLOCKS).fill(0),
        ...changes,
    };
}

// Land of the given value over the top half of the blocks, each carrying the same traffic, and none below
export function developedLand(landValue: number, traffic: number): Pick<Year, "landValueAverage" | "landValue" | "traffic"> {
    const topHalf = (value: number) => Array.from({length: BLOCKS}, (_, block) => (block < BLOCKS / 2 ? value : 0));
    return {landValueAverage: landValue, landValue: topHalf(landValue), traffic: topHalf(traffic)};
}
