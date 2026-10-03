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

import { Evaluation } from "../src/evaluation.js";
import { scoreBreakdownRows, signedPoints } from "../src/scoreBreakdownView";
import { Text } from "../src/text.js";

describe("the score breakdown's rows", () => {

    it("start from last year's score and give each step's points and the score it left", () => {
        const breakdown = [
            {points: 168, reason: Evaluation.SCORE_PROBLEMS},
            {points: -122, reason: Evaluation.SCORE_RES_CAP},
            {points: 0, reason: Evaluation.SCORE_TAXES},
            {points: 91, reason: Evaluation.SCORE_AVERAGING},
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

    it("have a label for every reason the evaluation records", () => {
        const reasons = Object.getOwnPropertyNames(Evaluation)
            .filter((name) => name.startsWith("SCORE_"))
            .map((name) => (Evaluation as unknown as Record<string, string>)[name]);
        const labels: Record<string, string> = Text.scoreBreakdown.reasons;

        expect(reasons.length).toBe(16);
        for (const reason of reasons)
            expect(labels[reason]).toEqual(expect.any(String));
    });
});

describe("signed points", () => {

    it.each([[12, "+12"], [0, "0"], [-7, "-7"]])("show %p as %p", (points, text) => {
        expect(signedPoints(points)).toBe(text);
    });
});
