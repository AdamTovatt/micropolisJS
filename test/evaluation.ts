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

// TypeScript modules are imported without an extension, as in the rest of test/
import { BlockMap } from "../src/blockMap";
import { Budget } from "../src/budget.js";
import { Census } from "../src/census.js";
import { Evaluation } from "../src/evaluation.js";
import { Random } from "../src/random";
import type { ScoreEntry } from "../src/scoreBreakdownView";
import { Valves } from "../src/valves.js";

// The stream only drives the opinion poll and the problem votes, never the score
function newEvaluation() {
    return new Evaluation(Random.fromSeed(1));
}

interface YearState {
    resPop: number;
    comPop: number;
    indPop: number;
    crime: number;
    pollution: number;
    landValue: number;
    traffic: number;
    firePop: number;
    poweredZones: number;
    unpoweredZones: number;
    tax: number;
    roadEffect?: number;
    policeEffect?: number;
    fireEffect?: number;
    resCap?: boolean;
    comCap?: boolean;
    indCap?: boolean;
    resValve?: number;
    comValve?: number;
    indValve?: number;
}

const MAP_WIDTH = 16;
const MAP_HEIGHT = 16;

function makeCity() {
    const landValueMap = new BlockMap(MAP_WIDTH, MAP_HEIGHT, 2);
    const trafficDensityMap = new BlockMap(MAP_WIDTH, MAP_HEIGHT, 2);

    return {
        blockMaps: {landValueMap, trafficDensityMap},
        budget: new Budget(),
        census: new Census(),
        evaluation: newEvaluation(),
        valves: new Valves(),
    };
}

type City = ReturnType<typeof makeCity>;

// Sets up one year's census, budget and valves, then runs the yearly evaluation
function evaluateYear(city: City, state: YearState) {
    const {blockMaps, budget, census, evaluation, valves} = city;

    census.resPop = state.resPop;
    census.comPop = state.comPop;
    census.indPop = state.indPop;
    census.totalPop = state.resPop + state.comPop + state.indPop;
    census.crimeAverage = state.crime;
    census.pollutionAverage = state.pollution;
    census.landValueAverage = state.landValue;
    census.firePop = state.firePop;
    census.poweredZoneCount = state.poweredZones;
    census.unpoweredZoneCount = state.unpoweredZones;

    // Half the blocks are developed land, each carrying the same traffic
    for (let x = 0; x < MAP_WIDTH; x += 2) {
        for (let y = 0; y < MAP_HEIGHT / 2; y += 2) {
            blockMaps.landValueMap.worldSet(x, y, state.landValue);
            blockMaps.trafficDensityMap.worldSet(x, y, state.traffic);
        }
    }

    budget.cityTax = state.tax;
    budget.roadEffect = state.roadEffect ?? budget.MAX_ROAD_EFFECT;
    budget.policeEffect = state.policeEffect ?? budget.MAX_POLICESTATION_EFFECT;
    budget.fireEffect = state.fireEffect ?? budget.MAX_FIRESTATION_EFFECT;

    valves.resCap = state.resCap ?? false;
    valves.comCap = state.comCap ?? false;
    valves.indCap = state.indCap ?? false;
    valves.resValve = state.resValve ?? 0;
    valves.comValve = state.comValve ?? 0;
    valves.indValve = state.indValve ?? 0;

    evaluation.cityEvaluation({blockMaps, budget, census, valves});
}

const THRIVING_TOWN: YearState[] = [
    {resPop: 300, comPop: 40, indPop: 50, crime: 20, pollution: 30, landValue: 100, traffic: 10,
     firePop: 0, poweredZones: 40, unpoweredZones: 0, tax: 7},
    {resPop: 400, comPop: 60, indPop: 60, crime: 25, pollution: 35, landValue: 110, traffic: 12,
     firePop: 0, poweredZones: 50, unpoweredZones: 0, tax: 7},
    {resPop: 400, comPop: 60, indPop: 60, crime: 25, pollution: 35, landValue: 110, traffic: 12,
     firePop: 0, poweredZones: 50, unpoweredZones: 0, tax: 7},
];

// Sets every condition the score checks: capped and collapsed valves, underfunded roads, police
// and fire, growth, decline, fires, taxes and unpowered zones
const TROUBLED_CITY: YearState[] = [
    {resPop: 600, comPop: 120, indPop: 80, crime: 40, pollution: 60, landValue: 60, traffic: 20,
     firePop: 4, poweredZones: 60, unpoweredZones: 0, tax: 9},
    {resPop: 900, comPop: 150, indPop: 100, crime: 50, pollution: 70, landValue: 70, traffic: 25,
     firePop: 6, poweredZones: 70, unpoweredZones: 20, tax: 11, roadEffect: 20, policeEffect: 500,
     fireEffect: 400, resCap: true, comCap: true, indCap: true, indValve: -1200},
    {resPop: 1000, comPop: 160, indPop: 110, crime: 45, pollution: 65, landValue: 75, traffic: 22,
     firePop: 2, poweredZones: 90, unpoweredZones: 5, tax: 10, resCap: true, resValve: -1500,
     comValve: -1100},
    {resPop: 800, comPop: 150, indPop: 100, crime: 45, pollution: 65, landValue: 75, traffic: 22,
     firePop: 2, poweredZones: 90, unpoweredZones: 5, tax: 10},
];

// A year without problems: no crime, pollution, land value, traffic, fires or tax, and as many
// residents as jobs. Its base score is 1000, so each step's points can be worked out by hand. It
// has (resPop + resPop) * 20 people, and resPop is a multiple of 8.
function problemFreeYear(resPop: number, changes: Partial<YearState> = {}): YearState {
    return {resPop, comPop: resPop / 8, indPop: 0, crime: 0, pollution: 0, landValue: 0, traffic: 0, firePop: 0,
            poweredZones: 10, unpoweredZones: 0, tax: 0, ...changes};
}

function scoresOver(years: YearState[]): number[] {
    const city = makeCity();
    return years.map((state) => {
        evaluateYear(city, state);
        return city.evaluation.cityScore;
    });
}

function sumOfPoints(breakdown: ScoreEntry[]): number {
    return breakdown.reduce((total, entry) => total + entry.points, 0);
}

function reasonsOf(breakdown: ScoreEntry[]): string[] {
    return breakdown.map((entry) => entry.reason);
}

// The entry for a step, and the score the step started from, given last year's score
function stepOf(breakdown: ScoreEntry[], lastScore: number, reason: string): {entry: ScoreEntry, scoreBefore: number} {
    const index = breakdown.findIndex((entry) => entry.reason === reason);
    expect(index).toBeGreaterThan(0);
    return {entry: breakdown[index], scoreBefore: lastScore + sumOfPoints(breakdown.slice(0, index))};
}

describe("the city score breakdown", () => {

    it("sums to the change from last year's score, every year", () => {
        for (const years of [THRIVING_TOWN, TROUBLED_CITY]) {
            const city = makeCity();
            for (const state of years) {
                const lastScore = city.evaluation.cityScore;
                evaluateYear(city, state);

                const {cityScore, cityScoreDelta} = city.evaluation;
                const breakdown: ScoreEntry[] = city.evaluation.cityScoreBreakdown;
                expect(cityScoreDelta).toBe(cityScore - lastScore);
                expect(sumOfPoints(breakdown)).toBe(cityScoreDelta);
            }
        }
    });

    // The score is an int in evaluate.cpp, so each cut drops its fraction: 1000 * 0.85 = 850,
    // 850 * 0.85 = 722.5 and 722 * 0.85 = 613.7, then (500 + 613) / 2 = 556.5
    it("shows the 15% cut for each capped valve", () => {
        const city = makeCity();
        evaluateYear(city, problemFreeYear(200, {resCap: true, comCap: true, indCap: true}));

        expect(city.evaluation.cityScoreBreakdown).toEqual([
            {reason: Evaluation.SCORE_PROBLEMS, points: 1000 - 500},
            {reason: Evaluation.SCORE_RES_CAP, points: 850 - 1000},
            {reason: Evaluation.SCORE_COM_CAP, points: 722 - 850},
            {reason: Evaluation.SCORE_IND_CAP, points: 613 - 722},
            {reason: Evaluation.SCORE_AVERAGING, points: 556 - 613},
        ]);
    });

    // Each scales a base of 1000 to a score with a fraction, which evaluate.cpp's int score drops
    it.each([
        // 1000 * (1 + 1600 / 9600) = 1166.67
        ["growth from 8000 to 9600 people", [problemFreeYear(200), problemFreeYear(240)],
         Evaluation.SCORE_MIGRATION, 1166],
        // 1000 * (0.95 - 3200 / 9600) = 616.67: 0.95 less the share of last year's people who left
        ["decline from 9600 to 6400 people", [problemFreeYear(240), problemFreeYear(160)],
         Evaluation.SCORE_MIGRATION, 616],
        // 1000 * (0.9 + 337 / 10000.1) = 933.7: up to 10% off, in proportion to the funding missing
        ["police funded at 337 of 1000", [problemFreeYear(200, {policeEffect: 337})],
         Evaluation.SCORE_POLICE_FUNDING, 933],
        ["fire funded at 337 of 1000", [problemFreeYear(200, {fireEffect: 337})],
         Evaluation.SCORE_FIRE_FUNDING, 933],
        // 1000 * (0.9 + 500 / 10000.1) = 949.9995, where a divisor of 10 would give exactly 950
        ["police funded at half", [problemFreeYear(200, {policeEffect: 500})], Evaluation.SCORE_POLICE_FUNDING, 949],
        ["fire funded at half", [problemFreeYear(200, {fireEffect: 500})], Evaluation.SCORE_FIRE_FUNDING, 949],
        // 1000 * (2 / 3) = 666.67
        ["2 of 3 zones powered", [problemFreeYear(200, {poweredZones: 2, unpoweredZones: 1})],
         Evaluation.SCORE_UNPOWERED_ZONES, 666],
    ])("scales the score for %s, dropping the fraction", (_, years, reason, scoreAfter) => {
        const city = makeCity();
        for (const state of years.slice(0, -1))
            evaluateYear(city, state);
        const lastScore = city.evaluation.cityScore;
        evaluateYear(city, years[years.length - 1]);

        const step = stepOf(city.evaluation.cityScoreBreakdown, lastScore, reason);
        expect(step.scoreBefore).toBe(1000);
        expect(step.entry.points).toBe(scoreAfter - 1000);
    });

    it("credits each step with exactly the points it moved the score", () => {
        const city = makeCity();
        evaluateYear(city, TROUBLED_CITY[0]);
        const lastScore = city.evaluation.cityScore;
        evaluateYear(city, TROUBLED_CITY[1]);
        const breakdown: ScoreEntry[] = city.evaluation.cityScoreBreakdown;
        const step = (reason: string) => stepOf(breakdown, lastScore, reason);

        // Road funding at 20 of 32, 6 burning tiles at 5 points each, and an 11% tax. The scaled
        // steps have tests of their own above.
        expect(step(Evaluation.SCORE_ROAD_FUNDING).entry.points).toBe(-12);
        expect(step(Evaluation.SCORE_FIRES).entry.points).toBe(-30);
        expect(step(Evaluation.SCORE_TAXES).entry.points).toBe(-11);
    });

    it("leaves out adjustments that didn't move the score", () => {
        const city = makeCity();
        const lastScore = city.evaluation.cityScore;
        evaluateYear(city, {...TROUBLED_CITY[0], tax: 0, firePop: 0});

        // No tax, no fires, no migration yet, every zone powered and the score within range
        const breakdown: ScoreEntry[] = city.evaluation.cityScoreBreakdown;
        expect(stepOf(breakdown, lastScore, Evaluation.SCORE_AVERAGING).scoreBefore).toBeLessThan(1000);
        expect(reasonsOf(breakdown)).toEqual([Evaluation.SCORE_PROBLEMS, Evaluation.SCORE_AVERAGING]);
    });

    it("starts from the problems and ends with the averaging", () => {
        const city = makeCity();
        evaluateYear(city, THRIVING_TOWN[0]);
        evaluateYear(city, THRIVING_TOWN[1]);

        // Growth scales the score past 1000, so the clamp applies too
        expect(reasonsOf(city.evaluation.cityScoreBreakdown)).toEqual([
            Evaluation.SCORE_PROBLEMS,
            Evaluation.SCORE_MIGRATION,
            Evaluation.SCORE_TAXES,
            Evaluation.SCORE_RANGE,
            Evaluation.SCORE_AVERAGING,
        ]);
    });

    it("lists the adjustments in calculation order", () => {
        const city = makeCity();
        evaluateYear(city, TROUBLED_CITY[0]);
        evaluateYear(city, TROUBLED_CITY[1]);

        expect(reasonsOf(city.evaluation.cityScoreBreakdown)).toEqual([
            Evaluation.SCORE_PROBLEMS,
            Evaluation.SCORE_RES_CAP,
            Evaluation.SCORE_COM_CAP,
            Evaluation.SCORE_IND_CAP,
            Evaluation.SCORE_ROAD_FUNDING,
            Evaluation.SCORE_POLICE_FUNDING,
            Evaluation.SCORE_FIRE_FUNDING,
            Evaluation.SCORE_IND_OVERSUPPLY,
            Evaluation.SCORE_MIGRATION,
            Evaluation.SCORE_FIRES,
            Evaluation.SCORE_TAXES,
            Evaluation.SCORE_UNPOWERED_ZONES,
            Evaluation.SCORE_AVERAGING,
        ]);
    });

    it.each([
        // The second year's growth scales the score past 1000
        ["above 1000", THRIVING_TOWN.slice(0, 2), 1000],
        // Problems leave no base score, and fires and taxes take it below 0
        ["below 0", [{...TROUBLED_CITY[0], crime: 255, pollution: 255, firePop: 50}], 0],
    ])("records the clamp to the 0-1000 range for a score %s", (_, years, limit) => {
        const city = makeCity();
        for (const state of years.slice(0, -1))
            evaluateYear(city, state);
        const lastScore = city.evaluation.cityScore;
        evaluateYear(city, years[years.length - 1]);

        const range = stepOf(city.evaluation.cityScoreBreakdown, lastScore, Evaluation.SCORE_RANGE);
        expect(range.entry.points).toBe(limit - range.scoreBefore);
    });

    // One city's lifecycle, so the two empty states share a test
    it("is empty for a new city and once the city has no population", () => {
        const city = makeCity();
        expect(city.evaluation.cityScoreBreakdown).toEqual([]);

        evaluateYear(city, THRIVING_TOWN[0]);
        expect(city.evaluation.cityScoreBreakdown).not.toEqual([]);

        evaluateYear(city, {...THRIVING_TOWN[0], resPop: 0, comPop: 0, indPop: 0});
        expect(city.evaluation.cityScoreBreakdown).toEqual([]);
    });

    it("is saved and loaded with the evaluation", () => {
        const city = makeCity();
        evaluateYear(city, THRIVING_TOWN[0]);
        evaluateYear(city, THRIVING_TOWN[1]);

        const saveData: Record<string, unknown> = {};
        city.evaluation.save(saveData);
        const loaded = newEvaluation();
        loaded.load(JSON.parse(JSON.stringify(saveData)));

        expect(loaded.cityScore).toBe(city.evaluation.cityScore);
        expect(loaded.cityScoreBreakdown).toEqual(city.evaluation.cityScoreBreakdown);
        expect(loaded.cityScoreDelta).toBe(city.evaluation.cityScoreDelta);
        expect(loaded.cityScoreDelta).not.toBe(0);
    });

    // An old save is migrated to an empty breakdown (test/storage.ts); loading one replaces the
    // running city's breakdown and annual change
    it("loads empty into a running city from a save without one", () => {
        const city = makeCity();
        evaluateYear(city, THRIVING_TOWN[0]);
        expect(city.evaluation.cityScoreDelta).not.toBe(0);

        // A save of a city not yet evaluated, as a migrated one is
        const saveData: {evaluation?: Record<string, unknown>} = {};
        newEvaluation().save(saveData);
        saveData.evaluation!.cityScore = 640;
        city.evaluation.load(saveData);

        expect(city.evaluation.cityScore).toBe(640);
        expect(city.evaluation.cityScoreBreakdown).toEqual([]);
        expect(city.evaluation.cityScoreDelta).toBe(0);
    });
});

describe("the city score", () => {

    // Pinned scores over several years: a change to how the score is worked out moves them, and
    // its commit updates them and says why
    it("is pinned for a thriving town", () => {
        expect(scoresOver(THRIVING_TOWN)).toEqual([706, 853, 867]);
    });

    it("is pinned for a troubled city", () => {
        expect(scoresOver(TROUBLED_CITY)).toEqual([643, 458, 456, 525]);
    });
});
