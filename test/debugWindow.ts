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

import { debugActions } from "../src/debugWindow";

describe("the debug window's actions", () => {

    it.each([
        [{addFunds: false, downloadLog: false}, []],
        [{addFunds: true, downloadLog: false}, ["addFunds"]],
        [{addFunds: false, downloadLog: true}, ["downloadLog"]],
        [{addFunds: true, downloadLog: true}, ["addFunds", "downloadLog"]],
    ])("are those chosen, funds first: %p", (choices, actions) => {
        expect(debugActions(choices)).toEqual(actions);
    });
});
