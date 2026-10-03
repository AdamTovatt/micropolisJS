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
import * as Messages from "../src/messages";
import { Simulation } from "../src/simulation.js";
import { ANIMBIT } from "../src/tileFlags";
import { FIRE } from "../src/tileValues";
import { SimulationInstance, simulationFromSeed } from "./helpers/simulations";

const SEED = 2026;

function restore(simulation: SimulationInstance) {
    const saveData = {};
    simulation.save(saveData);
    const savedGame = JSON.parse(JSON.stringify(saveData));
    return new Simulation(new GameMap(120, 100), Simulation.LEVEL_EASY, Simulation.SPEED_MED, null, savedGame);
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
        simulationFromSeed(SEED).save(savedGame);

        expect(() => new Simulation(new GameMap(120, 100), Simulation.LEVEL_EASY, Simulation.SPEED_MED, SEED, savedGame))
            .toThrow("either a seed or a saved game");
        expect(() => new Simulation(new GameMap(120, 100), Simulation.LEVEL_EASY, Simulation.SPEED_MED, null, null))
            .toThrow("either a seed or a saved game");
    });

    describe("restored from a save", () => {

        function saveAndRestore() {
            const original = simulationFromSeed(SEED);
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

        it("takes the seed and the stream's state from a save loaded into a running simulation", () => {
            const original = simulationFromSeed(SEED);
            original.random.next();
            const saveData = {};
            original.save(saveData);
            const other = simulationFromSeed(SEED + 1);

            other.load(JSON.parse(JSON.stringify(saveData)));

            expect(other.seed).toBe(original.seed);
            expect(other.random.getState()).toEqual(original.random.getState());
        });

        it("runs its next phase at the same step as the original, as the speed cycle is saved", () => {
            const original = simulationFromSeed(SEED);
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
            ["slow", Simulation.SPEED_SLOW, 3],
            ["medium", Simulation.SPEED_MED, 5],
            ["fast", Simulation.SPEED_FAST, 15],
        ])("runs a phase on every step the %s speed lets through", (_, speed, phases) => {
            const simulation = simulationFromSeed(SEED, speed);

            steps(simulation, 15);

            expect(phasesRun(simulation)).toBe(phases);
        });

        it.each([
            ["slow", Simulation.SPEED_SLOW],
            ["fast", Simulation.SPEED_FAST],
        ])("moves the sprites on every step at %s speed", (_, speed) => {
            const simulation = simulationFromSeed(SEED, speed);

            steps(simulation, 15);

            expect(simulation.spriteManager.spriteCycle).toBe(15);
        });

        it("wraps its speed cycle from 1023 to 0, which runs a phase at slow speed", () => {
            const simulation = simulationFromSeed(SEED, Simulation.SPEED_SLOW);
            const simulate = jest.spyOn(simulation, "_simulate").mockImplementation(() => {});
            simulation._speedCycle = 1022;

            steps(simulation, 2);

            expect(simulation._speedCycle).toBe(0);
            expect(simulate).toHaveBeenCalledTimes(1);
        });

        it("moves the sprites but holds its speed cycle while awaiting budget values", () => {
            const simulation = simulationFromSeed(SEED, Simulation.SPEED_FAST);
            const simulate = jest.spyOn(simulation, "_simulate");
            simulation.budget.awaitingValues = true;

            steps(simulation, 15);

            expect(simulate).not.toHaveBeenCalled();
            expect(simulation._speedCycle).toBe(0);
            expect(simulation.spriteManager.spriteCycle).toBe(15);
        });

        it("does nothing while paused", () => {
            const simulation = simulationFromSeed(SEED, Simulation.SPEED_PAUSED);

            steps(simulation, 15);

            expect(phasesRun(simulation)).toBe(0);
            expect(simulation.spriteManager.spriteCycle).toBe(0);
        });
    });

    describe("throttling its power messages", () => {

        const POWER_MESSAGE_INTERVAL = 3 * 48;

        function listen(simulation: SimulationInstance) {
            const subjects: string[] = [];
            simulation.addEventListener(Messages.FRONT_END_MESSAGE,
                                        (message: {subject: string}) => subjects.push(message.subject));
            return subjects;
        }

        function reportNotEnoughPower(simulation: SimulationInstance, cityTime: number) {
            simulation._cityTime = cityTime;
            (simulation._powerManager as unknown as {_emitEvent(event: string): void})._emitEvent(
                Messages.NOT_ENOUGH_POWER);
        }

        it("sends NOT_ENOUGH_POWER again only once the interval of city time has passed", () => {
            const simulation = simulationFromSeed(SEED);
            const subjects = listen(simulation);

            reportNotEnoughPower(simulation, 100);
            reportNotEnoughPower(simulation, 100 + POWER_MESSAGE_INTERVAL);
            reportNotEnoughPower(simulation, 100 + POWER_MESSAGE_INTERVAL + 1);

            expect(subjects).toEqual([Messages.NOT_ENOUGH_POWER, Messages.NOT_ENOUGH_POWER]);
        });

        it("holds back BLACKOUTS_REPORTED for the interval after NOT_ENOUGH_POWER", () => {
            const simulation = simulationFromSeed(SEED);
            const subjects = listen(simulation);

            // Most zones unpowered while a plant runs: the blackouts condition holds
            const census = simulation._census;
            census.coalPowerPop = 1;
            census.poweredZoneCount = 1;
            census.unpoweredZoneCount = 9;

            // _sendMessages checks for blackouts when cityTime & 63 is 32: the first two checks fall inside the interval
            // after the NOT_ENOUGH_POWER at 0, and the third past it
            reportNotEnoughPower(simulation, 0);
            for (const cityTime of [32, 96, 160]) {
                simulation._cityTime = cityTime;
                simulation._sendMessages();
            }

            const powerMessages = subjects.filter((subject) =>
                subject === Messages.NOT_ENOUGH_POWER || subject === Messages.BLACKOUTS_REPORTED);
            expect(powerMessages).toEqual([Messages.NOT_ENOUGH_POWER, Messages.BLACKOUTS_REPORTED]);
        });
    });
});
