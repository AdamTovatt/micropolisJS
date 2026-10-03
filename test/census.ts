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

import { Census } from "../src/census.js";

// The census creates its history arrays by name at runtime, so the type inferred from census.js lacks them
function history(census: Census, name: string): number[] {
    return (census as unknown as Record<string, number[]>)[name];
}

describe("the census", () => {

    describe("when taking the short-term census", () => {

        // Residential population scales down by 256 when compared against the hospital count
        const RESIDENTS_NEEDING_TWO_HOSPITALS = 512;

        it("should ask for a hospital when there are too few", () => {
            const census = new Census();
            census.resPop = RESIDENTS_NEEDING_TWO_HOSPITALS;
            census.hospitalPop = 1;

            census.take10Census({cashFlow: 0});

            expect(census.needHospital).toBe(1);
        });

        it("should ask to lose a hospital when there are too many", () => {
            const census = new Census();
            census.resPop = RESIDENTS_NEEDING_TWO_HOSPITALS;
            census.hospitalPop = 3;

            census.take10Census({cashFlow: 0});

            expect(census.needHospital).toBe(-1);
        });

        it("should ask for no change when there are enough hospitals", () => {
            const census = new Census();
            census.resPop = RESIDENTS_NEEDING_TWO_HOSPITALS;
            census.hospitalPop = 2;

            census.take10Census({cashFlow: 0});

            expect(census.needHospital).toBe(0);
        });

        // The money history records cashFlow / 20 + 128, clamped to 0-255
        const NO_CASH_FLOW = 128;

        it("should record the budget's cash flow", () => {
            const census = new Census();

            census.take10Census({cashFlow: 200});

            expect(history(census, "moneyHist10")[0]).toBe(NO_CASH_FLOW + 10);
        });

        it("should truncate a negative cash flow toward zero, as the original's integer division does", () => {
            const census = new Census();

            census.take10Census({cashFlow: -30});

            expect(history(census, "moneyHist10")[0]).toBe(NO_CASH_FLOW - 1);
        });

        it("should clamp the cash flow to 0-255", () => {
            const rich = new Census();
            const broke = new Census();

            rich.take10Census({cashFlow: 100000});
            broke.take10Census({cashFlow: -100000});

            expect(history(rich, "moneyHist10")[0]).toBe(255);
            expect(history(broke, "moneyHist10")[0]).toBe(0);
        });
    });
});
