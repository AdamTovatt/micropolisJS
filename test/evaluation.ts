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
import { Evaluation } from "../src/evaluation.js";
import type { ScoreEntry } from "../src/scoreBreakdownView";
import { developedLand, evaluateYear, makeCity, newEvaluation, problemFreeYear, type Year } from "./helpers/evaluationCity";

// Each year sets its figures over a problem-free year of its residents
const THRIVING_TOWN: Year[] = [
    problemFreeYear(300, {comPop: 40, indPop: 50, crimeAverage: 20, pollutionAverage: 30, ...developedLand(100, 10),
                          poweredZoneCount: 40, cityTax: 7}),
    problemFreeYear(400, {comPop: 60, indPop: 60, crimeAverage: 25, pollutionAverage: 35, ...developedLand(110, 12),
                          poweredZoneCount: 50, cityTax: 7}),
    problemFreeYear(400, {comPop: 60, indPop: 60, crimeAverage: 25, pollutionAverage: 35, ...developedLand(110, 12),
                          poweredZoneCount: 50, cityTax: 7}),
];

// Sets every condition the score checks: capped and collapsed valves, underfunded roads, police
// and fire, growth, decline, fires, taxes and unpowered zones
const TROUBLED_CITY: Year[] = [
    problemFreeYear(600, {comPop: 120, indPop: 80, crimeAverage: 40, pollutionAverage: 60, ...developedLand(60, 20),
                          firePop: 4, poweredZoneCount: 60, cityTax: 9}),
    problemFreeYear(900, {comPop: 150, indPop: 100, crimeAverage: 50, pollutionAverage: 70, ...developedLand(70, 25),
                          firePop: 6, poweredZoneCount: 70, unpoweredZoneCount: 20, cityTax: 11, roadEffect: 20,
                          policeEffect: 500, fireEffect: 400, resCap: true, comCap: true, indCap: true,
                          indValve: -1200}),
    problemFreeYear(1000, {comPop: 160, indPop: 110, crimeAverage: 45, pollutionAverage: 65, ...developedLand(75, 22),
                           firePop: 2, poweredZoneCount: 90, unpoweredZoneCount: 5, cityTax: 10, resCap: true,
                           resValve: -1500, comValve: -1100}),
    problemFreeYear(800, {comPop: 150, indPop: 100, crimeAverage: 45, pollutionAverage: 65, ...developedLand(75, 22),
                          firePop: 2, poweredZoneCount: 90, unpoweredZoneCount: 5, cityTax: 10}),
];

function scoresOver(years: Year[]): number[] {
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

    // Each scales the score to one with a fraction, which evaluate.cpp's int score drops. Most start
    // from a problem-free base of 1000.
    it.each([
        // 1000 * (1 + 1600 / 9600) = 1166.67
        ["growth from 8000 to 9600 people", [problemFreeYear(200), problemFreeYear(240)],
         Evaluation.SCORE_MIGRATION, 1000, 1166],
        // 1000 * (0.95 - 3200 / 9600) = 616.67: 0.95 less the share of last year's people who left
        ["decline from 9600 to 6400 people", [problemFreeYear(240), problemFreeYear(160)],
         Evaluation.SCORE_MIGRATION, 1000, 616],
        // 1000 * (0.9 + 337 / 10000.1) = 933.7: up to 10% off, in proportion to the funding missing
        ["police funded at 337 of 1000", [problemFreeYear(200, {policeEffect: 337})],
         Evaluation.SCORE_POLICE_FUNDING, 1000, 933],
        ["fire funded at 337 of 1000", [problemFreeYear(200, {fireEffect: 337})],
         Evaluation.SCORE_FIRE_FUNDING, 1000, 933],
        // 1000 * (0.9 + 500 / 10000.1) = 949.9995, where a divisor of 10 would give exactly 950
        ["police funded at half", [problemFreeYear(200, {policeEffect: 500})],
         Evaluation.SCORE_POLICE_FUNDING, 1000, 949],
        ["fire funded at half", [problemFreeYear(200, {fireEffect: 500})],
         Evaluation.SCORE_FIRE_FUNDING, 1000, 949],
        // 1000 * (2 / 3) = 666.67
        ["2 of 3 zones powered", [problemFreeYear(200, {poweredZoneCount: 2, unpoweredZoneCount: 1})],
         Evaluation.SCORE_UNPOWERED_ZONES, 1000, 666],

        // evaluate.cpp works out the migration and power scales in float, where these come out a
        // point away from double.
        // 1000 * (0.95 - 320 / 640) is exactly 450: double falls just under it, and float rounds
        // the product to 450
        ["decline from 640 to 320 people", [problemFreeYear(16), problemFreeYear(8)],
         Evaluation.SCORE_MIGRATION, 1000, 450],
        // Crime and pollution of 255 give a base of (256 - 170) * 4 = 344, and 344 * (1 + 5440 /
        // 13760) is exactly 480: double rounds to it, and float's scale rounds down, so its product
        // falls just under
        ["growth from 8320 to 13760 people", [208, 344].map((resPop) =>
            problemFreeYear(resPop, {crimeAverage: 255, pollutionAverage: 255})),
         Evaluation.SCORE_MIGRATION, 344, 479],
        // Crime of 75 gives a base of (256 - 25) * 4 = 924, and 924 * 3 / 11 is exactly 252: double's
        // 3 / 11 rounds down, so its product falls just under, and float's rounds up
        ["3 of 11 zones powered", [problemFreeYear(200, {crimeAverage: 75, poweredZoneCount: 3, unpoweredZoneCount: 8})],
         Evaluation.SCORE_UNPOWERED_ZONES, 924, 252],
    ])("scales the score for %s, dropping the fraction", (_, years, reason, scoreBefore, scoreAfter) => {
        const city = makeCity();
        for (const state of years.slice(0, -1))
            evaluateYear(city, state);
        const lastScore = city.evaluation.cityScore;
        evaluateYear(city, years[years.length - 1]);

        const step = stepOf(city.evaluation.cityScoreBreakdown, lastScore, reason);
        expect(step.scoreBefore).toBe(scoreBefore);
        expect(step.entry.points).toBe(scoreAfter - scoreBefore);
    });

    // A third of the problems' sum, truncated, takes 4 points each from 1024, and the base is
    // clamped to 1000
    it.each([
        // 20 / 3 = 6: 1024 - 24
        ["crime of 20", {crimeAverage: 20}, 1000],
        // 21 / 3 = 7: 1024 - 28
        ["crime of 21", {crimeAverage: 21}, 996],
        // Unemployment is (200 / 400 - 1) * 255 = -127.5, which drops its fraction to -127, and
        // -127 / 3 = -42: 1024 + 168, clamped
        ["more jobs than residents", {comPop: 50}, 1000],
        // Unemployment is (200 / 160 - 1) * 255 = 63.75, which drops its fraction to 63, and with
        // crime of 2, 65 / 3 = 21: 1024 - 84
        ["more residents than jobs", {comPop: 20, crimeAverage: 2}, 940],
        // Unemployment is (32 / 24 - 1) * 255, exactly 85, which evaluate.cpp works out in float:
        // double falls just under and truncates to 84, float rounds to just over 85. With crime of
        // 2, 87 / 3 = 29: 1024 - 116
        ["32 residents for 24 jobs", {resPop: 32, comPop: 3, crimeAverage: 2}, 908],
        // 4096 commercial people make 32768 jobs, which wrap in evaluate.cpp's short to -32768.
        // Unemployment is (8192 / -32768 - 1) * 255 = -318.75, which drops its fraction to -318,
        // and with crime and pollution of 255, 192 / 3 = 64: 1024 - 256
        ["4096 commercial people, whose jobs wrap",
         {resPop: 8192, comPop: 4096, crimeAverage: 255, pollutionAverage: 255}, 768],
    ])("starts from the base score for %s", (_, changes, base) => {
        const city = makeCity();
        evaluateYear(city, problemFreeYear(200, changes));

        expect(city.evaluation.cityScoreBreakdown[0]).toEqual({reason: Evaluation.SCORE_PROBLEMS, points: base - 500});
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
        evaluateYear(city, {...TROUBLED_CITY[0], cityTax: 0, firePop: 0});

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
        ["below 0", [{...TROUBLED_CITY[0], crimeAverage: 255, pollutionAverage: 255, firePop: 50}], 0],
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

describe("the problems", () => {

    // Housing is 7/10 of the land value average, an int division in evaluate.cpp: 15 gives 10, not
    // 10.5. A voter objects to a problem above their tolerance, drawn from 0 to 299, and one of
    // this stream's voters on housing draws 10.
    it("drop the fraction of the housing problem", () => {
        const city = makeCity();
        evaluateYear(city, problemFreeYear(200, developedLand(15, 0)));

        const housing = city.evaluation.problemVotes.find(
            (vote: {index: number}) => vote.index === Evaluation.HOUSING);
        expect(housing.voteCount).toBe(3);
    });

    // Half the 64 blocks carry traffic of 12, and the count starts at 1: 384 / 33 = 11.6, which
    // drops its fraction, and 11 * 2.4 = 26.4 drops its own, as evaluate.cpp's ints do
    it("drop the fractions of the traffic average", () => {
        const city = makeCity();
        evaluateYear(city, problemFreeYear(200, developedLand(1, 12)));

        expect(city.census.trafficAverage).toBe(26);
    });
});

describe("the city score", () => {

    // Pinned scores over several years: a change to how the score is worked out moves them, and
    // its commit updates them and says why
    it("is pinned for a thriving town", () => {
        expect(scoresOver(THRIVING_TOWN)).toEqual([716, 858, 881]);
    });

    it("is pinned for a troubled city", () => {
        expect(scoresOver(TROUBLED_CITY)).toEqual([655, 468, 468, 540]);
    });
});
