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

import { Random } from "../src/random";

// storage.js reads window.localStorage when it loads, and the tests run in Node: stub the window, then import it
async function loadStorage() {
    (globalThis as unknown as {window: unknown}).window = {localStorage: {}};
    return (await import("../src/storage.js")).Storage;
}

describe("storage", () => {

    describe("when migrating a version 3 save", () => {

        it("gives it a uint32 seed and the simulation stream of that seed", async () => {
            const Storage = await loadStorage();
            const savedGame: {version: number, seed?: number, randomState?: number[]} = {version: 3};

            Storage.transitionOldSave(savedGame);

            expect(Number.isInteger(savedGame.seed)).toBe(true);
            expect(savedGame.seed).toBeGreaterThanOrEqual(0);
            expect(savedGame.seed).toBeLessThanOrEqual(0xffffffff);
            expect(savedGame.randomState).toEqual(Random.simulationStream(savedGame.seed!).getState());
        });

        it("starts its speed cycle from 0", async () => {
            const Storage = await loadStorage();
            const savedGame: {version: number, _speedCycle?: number} = {version: 3};

            Storage.transitionOldSave(savedGame);

            expect(savedGame._speedCycle).toBe(0);
        });
    });
});
