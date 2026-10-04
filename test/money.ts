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

import { formatCount, formatMoney } from "../src/money";

describe("formatMoney", () => {

    it("should prefix a positive amount with a dollar sign", () => {
        expect(formatMoney(12757)).toBe("$12,757");
    });

    it.each([[999, "$999"], [1000, "$1,000"], [999999, "$999,999"], [13775000, "$13,775,000"], [-1500, "-$1,500"]])(
        "should separate the thousands of %i, as %s", (amount, text) => {
            expect(formatMoney(amount)).toBe(text);
        });

    it("should show zero without a minus sign", () => {
        expect(formatMoney(0)).toBe("$0");
    });

    it("should put a single minus sign before the dollar sign", () => {
        expect(formatMoney(-500)).toBe("-$500");
    });
});

describe("formatCount", () => {

    it.each([[0, "0"], [440, "440"], [4360, "4,360"], [1234567, "1,234,567"], [-140, "-140"], [-2500, "-2,500"]])(
        "should write %i as %s", (count, text) => {
            expect(formatCount(count)).toBe(text);
        });
});
