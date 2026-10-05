/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

import { evaluationView } from "../src/evaluationWindow";
import { CITY_CLASSES, CITY_PROBLEMS, type EvaluationRecord, GAME_LEVELS } from "../src/protocol";

// The difficulty, by its number in GAME_LEVELS
const Level = {easy: GAME_LEVELS.indexOf("EASY"), medium: GAME_LEVELS.indexOf("MED"), hard: GAME_LEVELS.indexOf("HARD")};

// The breakdown's points sum to scoreDelta, so last year's score was 504 - -29 = 533
const RECORD: EvaluationRecord = {
    type: "evaluation",
    approval: 62,
    problems: [4, 0, 6],
    population: 7460,
    migration: -140,
    assessedValue: 13775000,
    cityClass: "TOWN",
    level: Level.medium,
    score: 504,
    scoreDelta: -29,
    scoreBreakdown: [{reason: "PROBLEMS", points: -15}, {reason: "TAXES", points: -14}],
};

describe("the evaluation window's view", () => {

    it("shows the record's figures as text, worst problem first", () => {
        expect(evaluationView(RECORD)).toEqual({
            yes: "62",
            no: "38",
            problems: ["Traffic", "Crime", "Fire"],
            population: "7,460",
            migration: "-140",
            assessedValue: "$13,775,000",
            level: "Medium",
            cityClass: "Town",
            score: "504",
            scoreDelta: "-29",
            scoreBreakdown: [
                {label: "Last year's score", value: "533"},
                {label: "Base score from problems", value: "-15 → 518"},
                {label: "Tax rate", value: "-14 → 504"},
            ],
        });
    });

    it("signs a rise in the score", () => {
        expect(evaluationView({...RECORD, scoreDelta: 12}).scoreDelta).toBe("+12");
    });

    it("lists no problems and no breakdown when the record has none", () => {
        const view = evaluationView({...RECORD, problems: [], scoreBreakdown: []});

        expect(view.problems).toEqual([]);
        expect(view.scoreBreakdown).toEqual([]);
    });

    it("has text for every problem", () => {
        const problems = evaluationView({...RECORD, problems: CITY_PROBLEMS.map((_, id) => id)}).problems;

        expect(problems).toEqual(["Crime", "Pollution", "Housing", "Taxes", "Traffic", "Unemployment", "Fire"]);
    });

    it("has text for every city class", () => {
        const classes = CITY_CLASSES.map((cityClass) => evaluationView({...RECORD, cityClass}).cityClass);

        expect(classes).toEqual(["Village", "Town", "City", "Capital", "Metropolis", "Megalopolis"]);
    });

    it.each(Object.entries(Level))("has text for the %s level", (name, level) => {
        expect(evaluationView({...RECORD, level}).level).toBe({easy: "Easy", medium: "Medium", hard: "Hard"}[name]);
    });
});
