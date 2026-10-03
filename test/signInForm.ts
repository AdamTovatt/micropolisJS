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


import { formStep } from "../src/signInForm";

describe("the sign-in form", () => {

    it.each([
        ["the server refuses the name", {outcome: "rejected", error: "A name is 1 to 32 characters long."}],
        ["the server limits sign-ins", {outcome: "too-many", error: "Too many sign-ins from here."}],
    ] as const)("shows the reason and stays open when %s", (_, result) => {
        expect(formStep(result)).toEqual({done: false, error: result.error});
    });

    it.each([
        ["signed in", {outcome: "signed-in"}],
        ["the server has gone since it answered", {outcome: "offline"}],
    ] as const)("closes and lets the game start when %s", (_, result) => {
        expect(formStep(result)).toEqual({done: true});
    });
});
