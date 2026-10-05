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

import { readdirSync } from "fs";

import { modulesReachedFrom, SRC } from "./helpers/importGraph";

// src/ is the client, and holds no simulation: the game's rules are the server's (Micropolis.Rules), and the page
// reaches a city only through a city source. So every module under src/ is one the page imports, and each is
// TypeScript.

const PAGE = "micropolis.ts";

describe("the page's import graph", () => {

    const page = modulesReachedFrom([PAGE]);
    const modules = readdirSync(SRC).filter((file) => /\.[jt]s$/.test(file)).sort();

    it("reaches every module under src/, and nothing else under it", () => {
        expect(page).toEqual(expect.arrayContaining(["game.ts", "webSocketCitySource.ts", "cityState.ts", "splashScreen.ts"]));
        expect([...page].sort()).toEqual(modules);
    });

    it("holds no JavaScript module", () => {
        expect(modules.filter((file) => file.endsWith(".js"))).toEqual([]);
    });
});
