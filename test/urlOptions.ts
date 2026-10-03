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

import { debugOption, seedOption } from "../src/urlOptions";

describe("the debug option", () => {

    it.each(["?debug=1", "?seed=4&debug=1", "?DEBUG=1", "? debug=1 "])("is on for %s", (query) => {
        expect(debugOption(query)).toBe(true);
    });

    it.each(["", "?", "?debug=0", "?debug=10", "?nodebug=1"])("is off for '%s'", (query) => {
        expect(debugOption(query)).toBe(false);
    });
});

describe("the seed option", () => {

    it("is null when the URL names no seed", () => {
        expect(seedOption("?debug=1")).toBeNull();
    });

    it.each([["0", 0], ["42", 42], ["4294967295", 0xffffffff]])("reads seed=%s", (text, seed) => {
        expect(seedOption(`?debug=1&seed=${text}`)).toBe(seed);
    });

    it.each(["", "-1", "4294967296", "1.5", "1e3", "0x10", "abc"])("refuses seed=%s", (text) => {
        expect(() => seedOption(`?seed=${text}`)).toThrow("?seed must be a whole number");
    });
});
