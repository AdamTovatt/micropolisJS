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

import { saveFileName } from "../src/download";

describe("a city's save file", () => {

    it.each([
        ["Harbour", "Harbour.json"],
        ["New York", "New York.json"],
        ["Åby", "Åby.json"],
        ["a/b\\c", "a_b_c.json"],
        ["what? <now>", "what_ _now_.json"],
        ["C:town|\"x\"*", "C_town__x__.json"],
        ["tab\there", "tab_here.json"],
        ["..hidden", "hidden.json"],
        [". x", "x.json"],
        [" . .x", "x.json"],
        ["  spaced  ", "spaced.json"],
        ["", "city.json"],
        ["...", "city.json"],
    ])("for the city %p is named %p", (cityName, fileName) => {
        expect(saveFileName(cityName)).toBe(fileName);
    });
});
