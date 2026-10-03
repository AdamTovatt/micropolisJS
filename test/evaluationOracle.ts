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

import {
    BLOCK_SIZE, BLOCKS, MAP_HEIGHT, MAP_WIDTH, blockAt, evaluateYear, makeCity, problemFreeYear, type City, type Year,
} from "./helpers/evaluationCity";
import { lcg } from "./helpers/lcg";

// The original's yearly evaluation, as far as it works out the score: doPopNum, the problem table doProblems builds
// (with getTrafficAverage, getUnemployment and getFireSeverity), and getScore, from evaluate.cpp in the original's
// MicropolisEngine. It is transcribed with each C type's arithmetic made explicit, and is the oracle the port is
// compared with below:
// - short, int and Quad values are whole numbers: a cast to one, and a division of two, drop the fraction toward zero
//   (Math.trunc). The inputs stay in each type's range, so nothing overflows.
// - float arithmetic rounds every operation to 32 bits (Math.fround); double arithmetic is JavaScript's own.
// The problem votes are left out: they never feed the score, and the port's vote loop differs from the original's
// on purpose (see voteProblems).

const f = Math.fround;

// The cities are 16 tiles square, so thousands of them run quickly: getTrafficAverage's loop over the blocks is the
// same at any map size. Each year's inputs stay in their C types' ranges: the populations, averages, tax, fires,
// valves and zone counts are shorts, the effects Quads.
const WORLD_W = MAP_WIDTH;
const WORLD_H = MAP_HEIGHT;
const MAP_BLOCKSIZE = BLOCK_SIZE;
const MAX_ROAD_EFFECT = 32;
const MAX_POLICE_STATION_EFFECT = 1000;
const MAX_FIRE_STATION_EFFECT = 1000;

// What the evaluation leaves after a year, and carries into the next
interface Outcome {
    cityPop: number;          // Quad
    cityPopDelta: number;     // Quad
    cityScore: number;        // short
    cityScoreDelta: number;   // short
    trafficAverage: number;   // short
}

function getTrafficAverage(year: Year): number {
    let trafficTotal = 0;
    let count = 1;
    for (let x = 0; x < WORLD_W; x += MAP_BLOCKSIZE) {
        for (let y = 0; y < WORLD_H; y += MAP_BLOCKSIZE) {
            if (blockAt(year.landValue, x, y) > 0) {
                trafficTotal += blockAt(year.traffic, x, y);
                count++;
            }
        }
    }

    // (short)((trafficTotal / count) * 2.4): a Quad division, then a double product
    return Math.trunc(Math.trunc(trafficTotal / count) * 2.4);
}

function getUnemployment(year: Year): number {
    const b = (year.comPop + year.indPop) * 8;
    if (b === 0) {
        return 0;
    }

    // float r = ((float)resPop) / b; then (short)((r - 1) * 255), in float
    const r = f(f(year.resPop) / f(b));
    return Math.min(Math.trunc(f(f(r - 1) * 255)), 255);
}

function getFireSeverity(year: Year): number {
    return Math.min(year.firePop * 5, 255);
}

function problemTable(year: Year): number[] {
    return [
        year.crimeAverage,
        year.pollutionAverage,
        Math.trunc(year.landValueAverage * 7 / 10),
        year.cityTax * 10,
        getTrafficAverage(year),
        getUnemployment(year),
        getFireSeverity(year),
    ];
}

function originalEvaluation(carried: Outcome, year: Year): Outcome {
    const totalPop = year.resPop + year.comPop + year.indPop;
    if (totalPop <= 0) {
        // evalInit, which leaves the traffic average as it was
        return {cityPop: 0, cityPopDelta: 0, cityScore: 500, cityScoreDelta: 0, trafficAverage: carried.trafficAverage};
    }

    // doPopNum
    const cityPop = (year.resPop + (year.comPop + year.indPop) * 8) * 20;
    const cityPopDelta = cityPop - carried.cityPop;

    const problems = problemTable(year);

    // getScore
    let x = problems.reduce((total, problem) => total + problem, 0);
    x = Math.trunc(x / 3);
    x = Math.min(x, 256);
    let z = Math.min(Math.max((256 - x) * 4, 0), 1000);

    if (year.resCap) z = Math.trunc(z * .85);
    if (year.comCap) z = Math.trunc(z * .85);
    if (year.indCap) z = Math.trunc(z * .85);

    if (year.roadEffect < MAX_ROAD_EFFECT) {
        z -= MAX_ROAD_EFFECT - year.roadEffect;
    }
    if (year.policeEffect < MAX_POLICE_STATION_EFFECT) {
        z = Math.trunc(z * (0.9 + (year.policeEffect / (10.0001 * MAX_POLICE_STATION_EFFECT))));
    }
    if (year.fireEffect < MAX_FIRE_STATION_EFFECT) {
        z = Math.trunc(z * (0.9 + (year.fireEffect / (10.0001 * MAX_FIRE_STATION_EFFECT))));
    }

    if (year.resValve < -1000) z = Math.trunc(z * .85);
    if (year.comValve < -1000) z = Math.trunc(z * .85);
    if (year.indValve < -1000) z = Math.trunc(z * .85);

    let SM = f(1.0);
    if (cityPop === 0 || cityPopDelta === 0) {
        SM = f(1.0);
    } else if (cityPopDelta === cityPop) {
        SM = f(1.0);
    } else if (cityPopDelta > 0) {
        SM = f(f(f(cityPopDelta) / f(cityPop)) + f(1.0));
    } else if (cityPopDelta < 0) {
        SM = f(f(0.95) + f(f(cityPopDelta) / f(cityPop - cityPopDelta)));
    }

    z = Math.trunc(f(f(z) * SM));
    z = z - getFireSeverity(year) - year.cityTax;

    const TM = f(year.unpoweredZoneCount + year.poweredZoneCount);
    if (TM > 0.0) {
        z = Math.trunc(f(f(z) * f(f(year.poweredZoneCount) / TM)));
    }

    z = Math.min(Math.max(z, 0), 1000);

    const cityScore = Math.trunc((carried.cityScore + z) / 2);

    return {
        cityPop, cityPopDelta, cityScore, cityScoreDelta: cityScore - carried.cityScore,
        trafficAverage: problems[4],
    };
}

// The port's evaluation of the same year
function portEvaluation(city: City, year: Year): Outcome {
    evaluateYear(city, year);

    const {census, evaluation} = city;
    return {
        cityPop: evaluation.cityPop, cityPopDelta: evaluation.cityPopDelta, cityScore: evaluation.cityScore,
        cityScoreDelta: evaluation.cityScoreDelta, trafficAverage: census.trafficAverage,
    };
}

// Evaluates the years in turn, in the original and in the port, and describes the first year they differ in
function firstDifference(years: Year[]): string | null {
    const port = makeCity();
    let carried: Outcome = {cityPop: 0, cityPopDelta: 0, cityScore: 500, cityScoreDelta: 0, trafficAverage: 0};

    for (let yearNumber = 0; yearNumber < years.length; yearNumber++) {
        const year = years[yearNumber];
        const expected = originalEvaluation(carried, year);
        const actual = portEvaluation(port, year);

        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            // The figures, without the blocks
            const figures = JSON.stringify(year, (key, value) => (key === "landValue" || key === "traffic" ? undefined : value));
            return `year ${yearNumber}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)} for ${figures}`;
        }
        carried = expected;
    }

    return null;
}

// The first few of the cases' differences
function differences(cases: Year[][]): string[] {
    const found: string[] = [];
    for (let caseNumber = 0; caseNumber < cases.length; caseNumber++) {
        const difference = firstDifference(cases[caseNumber]);
        if (difference !== null) {
            found.push(`case ${caseNumber}, ${difference}`);
            if (found.length === 5) {
                break;
            }
        }
    }
    return found;
}

// A year of a random city, each figure in a range the simulation produces, some at their limits. One year in twenty
// the city has emptied, which the evaluation resets for.
function randomYear(next: (limit: number) => number): Year {
    const chance = (percent: number) => next(100) < percent;
    const either = (limit: number, value: number, percent: number) => chance(percent) ? value : next(limit + 1);
    const developed = next(100);
    const empty = chance(5);

    return {
        resPop: empty ? 0 : next(2000), comPop: empty ? 0 : next(600), indPop: empty ? 0 : next(600),
        crimeAverage: next(256), pollutionAverage: next(256), landValueAverage: next(251),
        cityTax: next(21), firePop: either(60, 0, 50),
        roadEffect: either(MAX_ROAD_EFFECT, MAX_ROAD_EFFECT, 50),
        policeEffect: either(MAX_POLICE_STATION_EFFECT, MAX_POLICE_STATION_EFFECT, 50),
        fireEffect: either(MAX_FIRE_STATION_EFFECT, MAX_FIRE_STATION_EFFECT, 50),
        resCap: chance(20), comCap: chance(20), indCap: chance(20),
        resValve: next(4001) - 2000, comValve: next(3001) - 1500, indValve: next(3001) - 1500,
        poweredZoneCount: next(500), unpoweredZoneCount: either(200, 0, 50),
        landValue: Array.from({length: BLOCKS}, () => (next(100) < developed ? 1 + next(250) : 0)),
        traffic: Array.from({length: BLOCKS}, () => next(256)),
    };
}

describe("the evaluation, against the original's", () => {

    it("matches evaluate.cpp for every year of random cities", () => {
        const cities = Array.from({length: 500}, (_, seed) => {
            const next = lcg(seed + 1);
            return Array.from({length: 8}, () => randomYear(next));
        });

        expect(differences(cities)).toEqual([]);
    });

    // Random cities seldom land on the inputs where the original's arithmetic parts from JavaScript's, so these sweep
    // them. 10.0001 matters only where 10 would make the cut's product whole, as it does for every tenth funding
    // level from a base of 1000.
    it("matches evaluate.cpp's police and fire cuts, for every funding level", () => {
        const cases: Year[][] = [];
        for (let effect = 0; effect < MAX_POLICE_STATION_EFFECT; effect++) {
            cases.push([problemFreeYear(200, {policeEffect: effect})], [problemFreeYear(200, {fireEffect: effect})]);
        }

        expect(differences(cases)).toEqual([]);
    });

    // Crime moves the base score in steps of 4 with each 3 points
    it("matches evaluate.cpp's unpowered zones scale, for every base score and up to 12 zones", () => {
        const cases: Year[][] = [];
        for (let crimeAverage = 0; crimeAverage <= 255; crimeAverage += 3) {
            for (let zones = 1; zones <= 12; zones++) {
                for (let poweredZoneCount = 0; poweredZoneCount <= zones; poweredZoneCount++) {
                    cases.push([problemFreeYear(200, {
                        crimeAverage, poweredZoneCount, unpoweredZoneCount: zones - poweredZoneCount})]);
                }
            }
        }

        expect(differences(cases)).toEqual([]);
    });

    // Crime and pollution at their limits give a base of (256 - 170) * 4 = 344, which growth's scale of under 2
    // can't take past the clamp to 1000
    it("matches evaluate.cpp's migration scale, for every pair of populations up to 16000", () => {
        const troubled = {crimeAverage: 255, pollutionAverage: 255};
        const cases: Year[][] = [];
        for (let lastResPop = 8; lastResPop <= 400; lastResPop += 8) {
            for (let resPop = 8; resPop <= 400; resPop += 8) {
                cases.push([problemFreeYear(lastResPop, troubled), problemFreeYear(resPop, troubled)]);
            }
        }

        expect(differences(cases)).toEqual([]);
    });

    // Crime of 0, 1 and 2 moves the sum across each multiple of 3, so a point of unemployment shows in the base
    it("matches evaluate.cpp's unemployment, for up to 300 residents and 72 jobs", () => {
        const cases: Year[][] = [];
        for (let resPop = 0; resPop <= 300; resPop++) {
            for (let comPop = 1; comPop <= 9; comPop++) {
                for (let crimeAverage = 0; crimeAverage <= 2; crimeAverage++) {
                    cases.push([problemFreeYear(8, {resPop, comPop, crimeAverage})]);
                }
            }
        }

        expect(differences(cases)).toEqual([]);
    });
});
