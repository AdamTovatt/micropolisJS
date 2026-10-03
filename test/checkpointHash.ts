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

import { checkpointHash } from "../e2e/checkpointHash";
import { plainSavedState, stateHash } from "../src/stateHash";
import { simulationFromSeed, SimulationInstance } from "./helpers/simulations";
import { removeWindow, stubWindow } from "./helpers/window";

// A game's save of a city, as the browser writes it: the simulation's state beside the game's own key, the city's
// name, and the save version storage.js stamps. Game needs the DOM, so its key is written out here as Game.saveData
// writes it.
async function gameSave(simulation: SimulationInstance): Promise<Record<string, unknown>> {
    stubWindow();
    const {Storage} = await import("../src/storage.js");

    return JSON.parse(Storage.serialise({...plainSavedState(simulation), name: "Town"}));
}

describe("a checkpoint's hash", () => {

    afterAll(() => {
        removeWindow();
    });

    it("is the state hash of the city in the save", async () => {
        // Any city that has moved on from a new one
        const simulation = simulationFromSeed(23);
        for (let i = 0; i < 500; i++) {
            simulation.step();
        }

        expect(await checkpointHash(await gameSave(simulation))).toBe(await stateHash(simulation));
    });

    it("leaves out the game's own keys", async () => {
        const save = await gameSave(simulationFromSeed(23));
        expect(Object.keys(save)).toEqual(expect.arrayContaining(["name", "version"]));
        const changed = {...save, name: "Another town", version: (save.version as number) + 1};

        expect(await checkpointHash(changed)).toBe(await checkpointHash(save));
    });

    it("refuses a save without the simulation's state", async () => {
        const save = await gameSave(simulationFromSeed(23));
        delete save.budget;

        await expect(checkpointHash(save)).rejects.toThrow("The save lacks the simulation's budget");
    });
});
