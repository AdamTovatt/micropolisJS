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

import { cityFromSave, cityFromSeed, Level, SaveData, Speed } from "../headless/city";
import { advance, startCity } from "../headless/runner";
import { canonicalJson } from "../src/canonicalJson";
import { GameMap } from "../src/gameMap.js";
import * as Messages from "../src/messages";
import { Simulation } from "../src/simulation.js";
import { plainSavedState, stateHash } from "../src/stateHash";
import { InspectedSave } from "./helpers/savedState";
import { newSimulation, SimulationInstance, YEAR, buildCity, simulationFromSeed } from "./helpers/simulations";

const SEED = 2026;
const OTHER_SEED = 2027;

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

    describe("restored from a save", () => {

        it("runs its next phase at the same step as the original, as the speed cycle is saved", () => {
            const original = simulationFromSeed(SEED);
            steps(original, 4);
            const restored = simulationFromSeed(OTHER_SEED);
            restored.load(plainSavedState(original));
            const originalBefore = phasesRun(original);
            const restoredBefore = phasesRun(restored);

            steps(original, 2);
            steps(restored, 2);

            // At medium speed the 6th step runs a phase
            expect(phasesRun(original) - originalBefore).toBe(1);
            expect(phasesRun(restored) - restoredBefore).toBe(1);
        });
    });

    describe("restored from a current save", () => {

        // A grown town, with sprites in flight, mid-cycle: at fast speed every step runs a phase
        let grownTownSave: InspectedSave;

        beforeAll(() => {
            const city = startCity({fixture: "town", speed: "fast"});
            advance(city, 3001);
            grownTownSave = plainSavedState(city) as typeof grownTownSave;
        });

        it("holds exactly the saved state: loading runs no scan", () => {
            expect(grownTownSave._phaseCycle).not.toBe(0);
            expect(grownTownSave.sprites.list.length).toBeGreaterThan(0);

            expect(plainSavedState(cityFromSave(grownTownSave))).toEqual(grownTownSave);
        });

        it("never shares the saved object with the city it restores", () => {
            const before = canonicalJson(grownTownSave);

            // Long enough for a yearly evaluation, so every array the load copies has been written since
            advance(cityFromSave(grownTownSave), 800);

            expect(canonicalJson(grownTownSave)).toBe(before);
        });

        it("gives its own level and speed to the city it is loaded over", () => {
            const original = cityFromSeed(SEED, Level.hard, Speed.fast);
            const restored = cityFromSeed(OTHER_SEED, Level.easy, Speed.medium);

            restored.load(plainSavedState(original));

            expect([restored.getLevel(), restored.getSpeed()]).toEqual([Level.hard, Speed.fast]);
        });

        // Rejected before anything is restored: the city is left as it was
        it("is never loaded over a city of another map size", async () => {
            const smallCity = newSimulation(new GameMap(60, 50), SEED);
            const before = await stateHash(smallCity);

            expect(() => smallCity.load(grownTownSave)).toThrow("A 120x100 save cannot be loaded over a 60x50 city");
            expect(await stateHash(smallCity)).toBe(before);
        });

        // Loaded over a city grown from another stream at another speed, with its own sprites in flight, rather than
        // the blank one cityFromSave builds: none of that city's map, scans, sprites or stream may reach the loaded
        // city's later cycles
        it("evolves as it would have loaded over a blank city, whatever city it is loaded over", async () => {
            const other = startCity({fixture: "town", reseed: OTHER_SEED, speed: "slow"});
            advance(other, 4000);
            expect((plainSavedState(other) as InspectedSave).sprites.list.length).toBeGreaterThan(0);
            other.load(grownTownSave);
            const overBlank = cityFromSave(grownTownSave);

            advance(other, 800);
            advance(overBlank, 800);

            expect(await stateHash(other)).toBe(await stateHash(overBlank));
        });

        it("must be migrated first if it predates version 5", () => {
            const saveData = plainSavedState(simulationFromSeed(SEED)) as SaveData & {scannedState?: object};
            delete saveData.scannedState;

            expect(() => cityFromSave(saveData))
                .toThrow("A save from before version 5 must be migrated before it is loaded");
        });
    });

    describe("stepping", () => {

        // At fast speed every step runs a phase: 16 steps reach the disasters in phase 15
        it("runs the disasters at its own level", () => {
            const simulation = simulationFromSeed(SEED, Simulation.SPEED_FAST);
            simulation.setLevel(Simulation.LEVEL_HARD);
            const doDisasters = jest.spyOn(simulation.disasterManager, "doDisasters");

            steps(simulation, 16);

            expect(doDisasters).toHaveBeenCalledWith(Simulation.LEVEL_HARD, expect.anything());
        });

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

    // The year end is the one point where the city waits on the player: nothing else stops the year advancing while a
    // window shows
    describe("at a year end that needs the player's budget", () => {

        // Steps the city until it asks for the budget, and returns how often it asked
        function stepUntilBudgetNeeded(simulation: SimulationInstance) {
            const needed = jest.fn();
            simulation.addEventListener(Messages.BUDGET_NEEDED, needed);

            for (let i = 0; i < 2 * YEAR && needed.mock.calls.length === 0; i++) {
                simulation.step();
            }

            return needed;
        }

        function expectHeldUntilBudgeted(simulation: SimulationInstance, needed: jest.Mock) {
            expect(needed).toHaveBeenCalledTimes(1);
            expect(simulation.budget.awaitingValues).toBe(true);

            const heldAt = simulation._cityTime;
            steps(simulation, YEAR);
            expect(simulation._cityTime).toBe(heldAt);
            expect(needed).toHaveBeenCalledTimes(1);

            // The rest of the year-end cycle, then the next cycle's first phase
            simulation.budget.doBudgetWindow();
            expect(simulation.budget.awaitingValues).toBe(false);
            steps(simulation, 16);
            expect(simulation._cityTime).toBe(heldAt + 1);
        }

        it("asks once with auto-budget off, and holds the city time until it has the values", () => {
            const simulation = buildCity(SEED, SEED);
            simulation.budget.setAutoBudget(false);

            const needed = stepUntilBudgetNeeded(simulation);

            expectHeldUntilBudgeted(simulation, needed);
        });

        it("asks once when auto-budget can't pay for the services, turns auto-budget off, and holds the city time",
           () => {
            const simulation = buildCity(SEED, SEED);
            simulation.budget.setFunds(0);
            simulation.budget.setTax(0);

            const needed = stepUntilBudgetNeeded(simulation);

            expect(simulation.budget.autoBudget).toBe(false);
            expectHeldUntilBudgeted(simulation, needed);
        });
    });
});
