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

import { GameMap } from "../src/gameMap.js";
import { MapGenerator } from "../src/mapGenerator.js";
import { Random } from "../src/random";
import { Simulation } from "../src/simulation.js";
import { ANIMBIT } from "../src/tileFlags";
import { FIRE } from "../src/tileValues";

const SEED = 2026;

// Simulation.js defines its constants with Object.defineProperties, so the type inferred from it lacks them
const Constants = Simulation as unknown as {LEVEL_EASY: number, SPEED_MED: number};

function newSimulation(seed: number) {
    return new Simulation(MapGenerator(Random.mapStream(seed)), Constants.LEVEL_EASY, Constants.SPEED_MED, seed, null);
}

describe("a simulation", () => {

    it("starts from either a seed or a saved game, not both or neither", () => {
        const savedGame = {};
        newSimulation(SEED).save(savedGame);

        expect(() => new Simulation(new GameMap(120, 100), Constants.LEVEL_EASY, Constants.SPEED_MED, SEED, savedGame))
            .toThrow("either a seed or a saved game");
        expect(() => new Simulation(new GameMap(120, 100), Constants.LEVEL_EASY, Constants.SPEED_MED, null, null))
            .toThrow("either a seed or a saved game");
    });

    describe("restored from a save", () => {

        function saveAndRestore() {
            const original = newSimulation(SEED);
            original.random.next();

            // A burning tile makes the restored simulation's construction scan draw from its stream
            original._map.setTile(60, 50, FIRE, ANIMBIT);

            const saveData = {};
            original.save(saveData);
            const savedGame = JSON.parse(JSON.stringify(saveData));

            const restored = new Simulation(new GameMap(120, 100), Constants.LEVEL_EASY, Constants.SPEED_MED, null,
                                            savedGame);
            return {original, restored};
        }

        it("keeps the seed", () => {
            const {original, restored} = saveAndRestore();

            expect(restored.seed).toBe(original.seed);
        });

        it("continues the stream from the saved state, whatever construction drew", () => {
            const {original, restored} = saveAndRestore();

            expect(restored.random.getState()).toEqual(original.random.getState());
            expect(restored.random.next()).toBe(original.random.next());
        });
    });
});
