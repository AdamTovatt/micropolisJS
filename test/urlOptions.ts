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

import { cityOption, debugOption, seedOption, withCityOption, withoutCityOption } from "../src/urlOptions";

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

describe("the city option", () => {

    const CITY = "0123456789abcdef0123456789abcdef";

    it("is null when the URL names no city", () => {
        expect(cityOption("?debug=1")).toBeNull();
    });

    it("reads a city's id", () => {
        expect(cityOption(`?debug=1&city=${CITY}`)).toBe(CITY);
    });

    it.each(["", CITY.toUpperCase(), CITY.slice(1), `${CITY}0`, "../secrets"])("refuses city=%s", (text) => {
        expect(() => cityOption(`?city=${encodeURIComponent(text)}`)).toThrow("?city must be a city's id");
    });

    it("is put in an address in place of any city it named, keeping its other options", () => {
        expect(withCityOption("http://localhost:44903/?debug=1&city=old#top", CITY))
            .toBe(`http://localhost:44903/?debug=1&city=${CITY}#top`);
        expect(cityOption(new URL(withCityOption("http://localhost:44903/", CITY)).search)).toBe(CITY);
    });

    it("reads the first city an address names twice, and is put in it in place of both", () => {
        const other = "fedcba9876543210fedcba9876543210";

        expect(cityOption(`?city=${CITY}&city=${other}`)).toBe(CITY);
        expect(withCityOption(`http://localhost:44903/?city=${other}&debug=1&city=${other}`, CITY))
            .toBe(`http://localhost:44903/?city=${CITY}&debug=1`);
    });

    it("is put in an address with a fragment and no query before it", () => {
        expect(withCityOption("http://localhost:44903/#top", CITY)).toBe(`http://localhost:44903/?city=${CITY}#top`);
    });

    it("is taken out of an address, every time it is named, keeping its other options and its fragment", () => {
        expect(withoutCityOption(`http://localhost:44903/?city=${CITY}&debug=1&city=${CITY}#top`))
            .toBe("http://localhost:44903/?debug=1#top");
        expect(withoutCityOption(`http://localhost:44903/?city=${CITY}`)).toBe("http://localhost:44903/");
        expect(withoutCityOption("http://localhost:44903/?seed=4")).toBe("http://localhost:44903/?seed=4");
    });
});
