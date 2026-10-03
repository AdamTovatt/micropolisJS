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

import { fixtureLog, fixtureNames } from "../headless/fixtures/index";
import { replay } from "../headless/runner";

// Each fixture's golden hashes are its log's checkpoints: the built hash at step 0, of the city once the log's
// commands have built it, which is the hash of its exported state, and the run hash after a fixed run at the speed
// the log's city starts at
describe("the golden hashes", () => {

    it.each(fixtureNames())("pin %s as built and after a run", (name) => {
        const steps = fixtureLog(name).checkpoints.map((checkpoint) => checkpoint.step);

        expect(steps[0]).toBe(0);
        expect(steps.length).toBeGreaterThan(1);
    });

    it.each(fixtureNames())("hold for %s", async (name) => {
        await expect(replay(fixtureLog(name)).verified).resolves.toBe(fixtureLog(name).checkpoints.length);
    });
});
