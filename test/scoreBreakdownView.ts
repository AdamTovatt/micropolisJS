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

import { type ScoreEntry } from "../src/protocol";
import { scoreBreakdownRows, signedPoints } from "../src/scoreBreakdownView";

describe("the score breakdown's rows", () => {

    it("start from last year's score and give each step's points and the score it left", () => {
        const breakdown: ScoreEntry[] = [
            {points: 168, reason: "PROBLEMS"},
            {points: -122, reason: "RES_CAP"},
            {points: 0, reason: "TAXES"},
            {points: 91, reason: "AVERAGING"},
        ];

        // Last year's score is this year's less the points: 781 - 137 = 644
        expect(scoreBreakdownRows(breakdown, 781)).toEqual([
            {label: "Last year's score", value: "644"},
            {label: "Base score from problems", value: "+168 → 812"},
            {label: "No stadium", value: "-122 → 690"},
            {label: "Tax rate", value: "0 → 690"},
            {label: "Averaged with last year", value: "+91 → 781"},
        ]);
    });

    it("are empty when there is no breakdown", () => {
        expect(scoreBreakdownRows([], 500)).toEqual([]);
    });
});

describe("signed points", () => {

    it.each([[12, "+12"], [0, "0"], [-7, "-7"]])("show %p as %p", (points, text) => {
        expect(signedPoints(points)).toBe(text);
    });
});
