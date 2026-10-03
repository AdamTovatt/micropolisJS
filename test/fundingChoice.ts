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

import { FundingChoice, wholePercent } from "../src/fundingChoice";

describe("wholePercent", () => {

    it("should show a percentage set from a whole slider position as that position", () => {
        // In double, 0.57 * 100 is 56.99999999999999; the original's float product is 57
        expect(wholePercent(0.57)).toBe(57);
        expect(wholePercent(Math.fround(0.57))).toBe(57);
    });

    it("should drop the fraction of a percent", () => {
        expect(wholePercent(0.567)).toBe(56);
    });
});

describe("FundingChoice", () => {

    const held = { road: 0.57, fire: Math.fround(140 / 300), police: 0.05 };

    it("should offer the percentages the budget has until a slider moves", () => {
        const choice = new FundingChoice(held);

        expect(choice.percents()).toEqual(held);
        expect(choice.changes()).toEqual({});
    });

    it("should change only the percentage of the slider moved, stored as the original's float", () => {
        const choice = new FundingChoice(held);
        choice.choose("fire", 80);

        expect(choice.percents()).toEqual({ ...held, fire: Math.fround(0.8) });
        expect(choice.changes()).toEqual({ fire: Math.fround(0.8) });
    });

    it("should store a moved slider's percentage so the original's display shows it back, but for 53% and 59%", () => {
        // In float, 0.53 * 100 is 52.999996 and 0.59 * 100 is 58.999996, so the original's window shows those one lower
        const choice = new FundingChoice(held);
        const shownOtherwise: number[][] = [];
        for (let percent = 0; percent <= 100; percent++) {
            choice.choose("road", percent);
            const shown = wholePercent(choice.percents().road);
            if (shown !== percent)
                shownOtherwise.push([percent, shown]);
        }

        expect(shownOtherwise).toEqual([[53, 52], [59, 58]]);
    });
});
