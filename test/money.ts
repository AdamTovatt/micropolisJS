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

import { formatMoney } from "../src/money";

describe("formatMoney", () => {

    it("should prefix a positive amount with a dollar sign", () => {
        expect(formatMoney(12757)).toBe("$12757");
    });

    it("should show zero without a minus sign", () => {
        expect(formatMoney(0)).toBe("$0");
    });

    it("should put a single minus sign before the dollar sign", () => {
        expect(formatMoney(-500)).toBe("-$500");
    });
});
