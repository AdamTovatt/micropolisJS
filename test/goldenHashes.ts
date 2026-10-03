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

import { fixtureNames } from "../headless/fixtures/index";
import { advance, startCity, summarise } from "../headless/runner";

// About three city years at medium speed
const STEPS = 6912;

// Each fixture's state hash as its script builds it, which is the hash of its exported state, and after STEPS steps
// at medium speed
const GOLDEN_HASHES: Record<string, {built: string, run: string}> = {
    town: {
        built: "2bef2f8f64e1941c8a29b6202fa3dd23c8c0d54f73a37f9a56f50b46959ff2ec",
        run: "8abbc233606361020d9ef13643b9759cc2aa993cae85149c3dd1b5d10f5c1644",
    },
};

describe("the golden hashes", () => {

    it("pin every fixture", () => {
        expect(Object.keys(GOLDEN_HASHES).sort()).toEqual(fixtureNames().sort());
    });

    it.each(Object.keys(GOLDEN_HASHES))("hold for %s as built", async (name) => {
        const city = startCity({fixture: name});

        expect((await summarise(city)).hash).toBe(GOLDEN_HASHES[name].built);
    });

    it.each(Object.keys(GOLDEN_HASHES))("hold for %s after a run", async (name) => {
        const city = startCity({fixture: name, speed: "medium"});
        advance(city, STEPS);

        expect((await summarise(city)).hash).toBe(GOLDEN_HASHES[name].run);
    });
});
