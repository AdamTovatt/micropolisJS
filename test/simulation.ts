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
const Constants = Simulation as unknown as {
    LEVEL_EASY: number, SPEED_PAUSED: number, SPEED_SLOW: number, SPEED_MED: number, SPEED_FAST: number,
};

type SimulationInstance = InstanceType<typeof Simulation>;

function newSimulation(seed: number, speed = Constants.SPEED_MED) {
    return new Simulation(MapGenerator(Random.mapStream(seed)), Constants.LEVEL_EASY, speed, seed, null);
}

function restore(simulation: SimulationInstance) {
    const saveData = {};
    simulation.save(saveData);
    const savedGame = JSON.parse(JSON.stringify(saveData));
    return new Simulation(new GameMap(120, 100), Constants.LEVEL_EASY, Constants.SPEED_MED, null, savedGame);
}

function steps(simulation: SimulationInstance, count: number) {
    for (let i = 0; i < count; i++) {
        simulation.step();
    }
}

// The phases a simulation has run, from its phase counter, for runs shorter than a cycle
function phasesRun(simulation: SimulationInstance) {
    return simulation._phaseCycle;
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

            return {original, restored: restore(original)};
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

        it("runs its next phase at the same step as the original, as the speed cycle is saved", () => {
            const original = newSimulation(SEED);
            steps(original, 4);
            const restored = restore(original);
            const originalBefore = phasesRun(original);
            const restoredBefore = phasesRun(restored);

            steps(original, 2);
            steps(restored, 2);

            // At medium speed the 6th step runs a phase
            expect(phasesRun(original) - originalBefore).toBe(1);
            expect(phasesRun(restored) - restoredBefore).toBe(1);
        });
    });

    describe("stepping", () => {

        it.each([
            ["slow", Constants.SPEED_SLOW, 3],
            ["medium", Constants.SPEED_MED, 5],
            ["fast", Constants.SPEED_FAST, 15],
        ])("runs a phase on every step the %s speed lets through", (_, speed, phases) => {
            const simulation = newSimulation(SEED, speed);

            steps(simulation, 15);

            expect(phasesRun(simulation)).toBe(phases);
        });

        it.each([
            ["slow", Constants.SPEED_SLOW],
            ["fast", Constants.SPEED_FAST],
        ])("moves the sprites on every step at %s speed", (_, speed) => {
            const simulation = newSimulation(SEED, speed);

            steps(simulation, 15);

            expect(simulation.spriteManager.spriteCycle).toBe(15);
        });

        it("wraps its speed cycle from 1023 to 0, which runs a phase at slow speed", () => {
            const simulation = newSimulation(SEED, Constants.SPEED_SLOW);
            const simulate = jest.spyOn(simulation, "_simulate").mockImplementation(() => {});
            simulation._speedCycle = 1022;

            steps(simulation, 2);

            expect(simulation._speedCycle).toBe(0);
            expect(simulate).toHaveBeenCalledTimes(1);
        });

        it("moves the sprites but holds its speed cycle while awaiting budget values", () => {
            const simulation = newSimulation(SEED, Constants.SPEED_FAST);
            const simulate = jest.spyOn(simulation, "_simulate");
            simulation.budget.awaitingValues = true;

            steps(simulation, 15);

            expect(simulate).not.toHaveBeenCalled();
            expect(simulation._speedCycle).toBe(0);
            expect(simulation.spriteManager.spriteCycle).toBe(15);
        });

        it("does nothing while paused", () => {
            const simulation = newSimulation(SEED, Constants.SPEED_PAUSED);

            steps(simulation, 15);

            expect(phasesRun(simulation)).toBe(0);
            expect(simulation.spriteManager.spriteCycle).toBe(0);
        });
    });
});
