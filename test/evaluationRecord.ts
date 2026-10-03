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

import { cityFromSeed, Level, Speed } from "../headless/city";
import { Evaluation } from "../src/evaluation.js";
import { evaluationRecord } from "../src/evaluationRecord";
import { CITY_CLASSES, CITY_PROBLEMS, GAME_LEVELS, SCORE_REASONS } from "../src/protocol";
import { Simulation } from "../src/simulation.js";
import { developedLand, evaluateYear, makeCity, newEvaluation, problemFreeYear } from "./helpers/evaluationCity";

const evaluationConstants = Evaluation as unknown as Record<string, string | number>;

function constantsNamed(prefix: string): (string | number)[] {
    return Object.getOwnPropertyNames(Evaluation)
        .filter((name) => name.startsWith(prefix))
        .map((name) => evaluationConstants[name]);
}

// A year with every problem the public can vote on
const TROUBLED_YEAR = problemFreeYear(600, {comPop: 120, indPop: 80, crimeAverage: 90, pollutionAverage: 120,
                                            ...developedLand(60, 200), firePop: 30, cityTax: 15});

// A year with crime and pollution, and no other problem the public can vote on
const PARTLY_TROUBLED_YEAR = problemFreeYear(600, {crimeAverage: 90, pollutionAverage: 120});

describe("the evaluation record", () => {

    it("names the city classes as the evaluation does, smallest first", () => {
        expect(constantsNamed("CC_")).toEqual([...CITY_CLASSES]);
    });

    it("names the score's reasons as the evaluation does, in the order it takes them", () => {
        expect(constantsNamed("SCORE_")).toEqual([...SCORE_REASONS]);
    });

    it("numbers each level as the simulation does", () => {
        const simulationConstants = Simulation as unknown as Record<string, number>;

        expect(GAME_LEVELS.map((level) => simulationConstants[`LEVEL_${level}`])).toEqual(GAME_LEVELS.map((_, i) => i));
    });

    it("numbers each problem as the evaluation does", () => {
        expect(CITY_PROBLEMS.map((problem) => evaluationConstants[problem])).toEqual(CITY_PROBLEMS.map((_, id) => id));
    });

    it("lists no problems before the first evaluation", () => {
        expect(evaluationRecord(newEvaluation(), Level.easy).problems).toEqual([]);
    });

    it("lists the problems the public ranked, worst first", () => {
        const city = makeCity();
        evaluateYear(city, TROUBLED_YEAR);
        const ranked = [0, 1, 2, 3].map((place) => city.evaluation.getProblemNumber(place));

        expect(ranked).not.toContain(null);
        expect(evaluationRecord(city.evaluation, Level.easy).problems).toEqual(ranked);
    });

    it("leaves out the places no problem got a vote for", () => {
        const city = makeCity();
        evaluateYear(city, PARTLY_TROUBLED_YEAR);
        const ranked = [0, 1, 2, 3].map((place) => city.evaluation.getProblemNumber(place));

        expect(ranked.slice(2)).toEqual([null, null]);
        expect(evaluationRecord(city.evaluation, Level.easy).problems).toEqual(ranked.slice(0, 2));
        expect([...ranked.slice(0, 2)].sort()).toEqual([Evaluation.CRIME, Evaluation.POLLUTION]);
    });

    it("lists no problems when none got a vote", () => {
        const city = makeCity();
        evaluateYear(city, problemFreeYear(600));

        expect(city.evaluation.getProblemNumber(0)).toBeNull();
        expect(evaluationRecord(city.evaluation, Level.easy).problems).toEqual([]);
    });

    it("carries the evaluation's figures", () => {
        const city = makeCity();
        evaluateYear(city, TROUBLED_YEAR);
        const evaluation = city.evaluation;

        expect(evaluationRecord(evaluation, Level.hard)).toEqual(expect.objectContaining({
            type: "evaluation",
            approval: evaluation.cityYes,
            population: evaluation.cityPop,
            migration: evaluation.cityPopDelta,
            assessedValue: evaluation.cityAssessedValue,
            cityClass: evaluation.cityClass,
            level: Level.hard,
            score: evaluation.cityScore,
            scoreDelta: evaluation.cityScoreDelta,
            scoreBreakdown: evaluation.cityScoreBreakdown,
        }));
    });

    it("shares nothing with the evaluation", () => {
        const city = makeCity();
        evaluateYear(city, TROUBLED_YEAR);
        const breakdown = JSON.stringify(city.evaluation.cityScoreBreakdown);

        const record = evaluationRecord(city.evaluation, Level.easy);
        record.scoreBreakdown[0].points += 1;
        record.scoreBreakdown.pop();

        expect(JSON.stringify(city.evaluation.cityScoreBreakdown)).toBe(breakdown);
    });

    it("is what the simulation gives, at the game's level", () => {
        const city = cityFromSeed(1, Level.medium, Speed.medium);

        expect(city.evaluationRecord()).toEqual(evaluationRecord(city.evaluation, Level.medium));
    });
});
