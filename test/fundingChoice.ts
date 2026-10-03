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
import { fundingPercent } from "../src/yearEndBudget";

describe("wholePercent", () => {

    it("should show a percentage as the original's window does, multiplying in float", () => {
        // In double, 0.57 * 100 is 56.99999999999999; the original's float product is 57
        expect(wholePercent(0.57)).toBe(57);
        expect(wholePercent(Math.fround(0.57))).toBe(57);
    });

    it("should drop the fraction of a percent", () => {
        expect(wholePercent(0.567)).toBe(56);
    });

    it("should show a percentage set from a slider at the slider's position, but for 53% and 59%", () => {
        // In float, 0.53 * 100 is 52.999996 and 0.59 * 100 is 58.999996, so the original's window shows those one lower
        const shownOtherwise: number[][] = [];
        for (let percent = 0; percent <= 100; percent++) {
            const shown = wholePercent(fundingPercent(percent));
            if (shown !== percent)
                shownOtherwise.push([percent, shown]);
        }

        expect(shownOtherwise).toEqual([[53, 52], [59, 58]]);
    });
});

describe("FundingChoice", () => {

    it("should hold no changes until a slider moves", () => {
        expect(new FundingChoice().changes()).toEqual({});
    });

    it("should hold the whole percent of each slider moved, the last position each", () => {
        const choice = new FundingChoice();
        choice.choose("fire", 80);
        choice.choose("road", 40);
        choice.choose("fire", 75);

        expect(choice.changes()).toEqual({ fire: 75, road: 40 });
    });
});
