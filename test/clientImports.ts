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

import { modulesReachedFrom, SIMULATION_ROOTS } from "./helpers/importGraph";

// The client reaches the city only through a city source: the page imports no module of the simulation's but the
// vocabulary the two share, which CLAUDE.md lists with the reason for each. The page plays through the server, so no
// simulation runs in it.

const PAGE = "micropolis.ts";

const SHARED_VOCABULARY = ["messages.ts", "protocol.ts", "tileFlags.ts", "tileValues.ts"];

describe("the page's import graph", () => {

    const simulation = modulesReachedFrom(SIMULATION_ROOTS);
    const page = modulesReachedFrom([PAGE]);

    // So the check below compares graphs that are there: each holds its own, and they meet at the vocabulary
    it("reaches the client's modules from the page, and meets the simulation only at the shared vocabulary", () => {
        expect(page).toEqual(expect.arrayContaining(["game.ts", "webSocketCitySource.ts", "cityState.ts", "splashScreen.ts"]));
        expect(SHARED_VOCABULARY.filter((name) => simulation.includes(name) && page.includes(name)))
            .toEqual(SHARED_VOCABULARY);
    });

    it("imports no simulation module but the shared vocabulary, not even for its types", () => {
        const imported = page.filter((name) => simulation.includes(name) && !SHARED_VOCABULARY.includes(name));

        expect(imported.sort()).toEqual([]);
    });
});
