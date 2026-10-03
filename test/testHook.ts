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

import { stepsPerCityTime } from "../src/cityTimeModel";
import { CommandQueue, StampedCommand } from "../src/commandQueue";
import { LOCAL_PLAYER } from "../src/commands";
import { Simulation } from "../src/simulation.js";
import { StepDriver } from "../src/stepDriver";
import type { TestHook } from "../src/testHook";
import { buildCity, simulationFromSeed, SimulationInstance, YEAR } from "./helpers/simulations";
import { removeWindow, stubWindow } from "./helpers/window";

// The hook saves through storage.ts, which needs a window
async function loadTestHook() {
    stubWindow();
    const {TestHook} = await import("../src/testHook");
    const {Storage} = await import("../src/storage");

    return {hook: new TestHook(), currentVersion: Storage.CURRENT_VERSION};
}

const STEPS_PER_CITY_TIME = stepsPerCityTime(Simulation.SPEED_MED);

// The game as the hook sees it, around a real simulation and command queue, recording the commands as they apply. A
// city that is paused, or on a page that isn't showing, doesn't step, as the game's doesn't, which says why. Tool paths
// the player has drawn wait for the game to send them, as the game's do until its next tick.
function gameOf(simulation: SimulationInstance) {
    const applied: StampedCommand[] = [];
    const commandQueue = new CommandQueue(simulation, {applied: (stamped) => applied.push(stamped), beforeStep: () => {}});
    const game = {
        stepDriver: new StepDriver(),
        pageShowing: true,
        notSteppingReason: () => {
            if (simulation.isPaused()) {
                return "it is paused";
            }

            return game.pageShowing ? null : "the page is hidden";
        },
        toolPaths: [] as unknown[],
        sendToolPaths: () => {
            game.toolPaths.splice(0).forEach((command) => commandQueue.send(LOCAL_PLAYER, command));
        },
        commandQueue,
        applied,
        stepSimulation: () => commandQueue.step(),
        saveData: () => {
            const saveData = {};
            simulation.save(saveData);
            return saveData;
        },
        simulation,
        gameCanvas: {getTileOrigin: () => ({x: 3, y: 4})},
        tileSet: {tileWidth: 16},
    };

    return game;
}

// A hook holding the driver of a game around a new city
async function holdingGame() {
    const {hook} = await loadTestHook();
    const game = gameOf(simulationFromSeed(1));
    hook.attach(game);
    hook.holdDriver();

    return {hook, game};
}

describe("the test hook", () => {

    afterAll(() => {
        removeWindow();
    });

    describe("before a game has started", () => {

        it.each(["applyInput", "advance", "save", "view", "cityTime", "commandsApplied"])("can't %s", async (method) => {
            const {hook} = await loadTestHook();
            const call = {
                applyInput: () => hook.applyInput(),
                advance: () => hook.advance(1),
                save: () => hook.save(),
                view: () => hook.view(),
                cityTime: () => hook.cityTime(),
                commandsApplied: () => hook.commandsApplied(),
            }[method]!;

            expect(call).toThrow("No game has started");
        });

        it("holds the driver of a game that starts after the hold", async () => {
            const {hook} = await loadTestHook();
            const game = gameOf(simulationFromSeed(1));

            hook.holdDriver();
            hook.attach(game);

            expect(game.stepDriver.isHeld()).toBe(true);
        });

        it("leaves the driver of a game that starts after a hold and release free", async () => {
            const {hook} = await loadTestHook();
            const game = gameOf(simulationFromSeed(1));

            hook.holdDriver();
            hook.releaseDriver();
            hook.attach(game);

            expect(game.stepDriver.isHeld()).toBe(false);
        });
    });

    it("releases the driver", async () => {
        const {hook, game} = await holdingGame();

        hook.releaseDriver();

        expect(game.stepDriver.isHeld()).toBe(false);
    });

    // An advance applies them before its first step, as the game's next tick would have, had it run before the advance
    it.each([
        ["applyInput", (hook: TestHook) => hook.applyInput()],
        ["advance", (hook: TestHook) => hook.advance(5)],
    ])("applies the commands sent, and the tool paths yet to be sent, before any step, through %s", async (_, act) => {
        const {hook, game} = await holdingGame();
        hook.advance(5);
        const road = {type: "tool", tool: "road", path: [{x: 10, y: 10}], autoBulldoze: true};
        game.commandQueue.send(LOCAL_PLAYER, {type: "setAutoBudget", on: false});
        game.toolPaths.push(road);

        act(hook);

        expect(game.applied.map(({step, command}) => [step, command]))
            .toEqual([[5, {type: "setAutoBudget", on: false}], [5, road]]);
        expect(game.toolPaths).toEqual([]);
    });

    describe("advancing", () => {

        it("advances the city by the steps asked, at its own speed", async () => {
            const {hook} = await holdingGame();

            expect(hook.advance(10 * STEPS_PER_CITY_TIME)).toEqual({budgetReviewDue: false});

            expect(hook.cityTime()).toBe(10);
            expect(hook.stepsTaken()).toBe(10 * STEPS_PER_CITY_TIME);
        });

        // Without auto-budget, the year end of a city with residents offers the budget to review, and the city steps on.
        // A hook holding a city with residents, a year in, with auto-budget turned off.
        async function cityWithoutAutoBudget() {
            const {hook} = await loadTestHook();
            const game = gameOf(buildCity(1, 1));
            hook.attach(game);
            hook.holdDriver();
            hook.advance(YEAR);
            game.commandQueue.send(LOCAL_PLAYER, {type: "setAutoBudget", on: false});

            return hook;
        }

        it("reports a year-end budget review that fell due, and takes every step regardless", async () => {
            const hook = await cityWithoutAutoBudget();

            expect(hook.advance(YEAR)).toEqual({budgetReviewDue: true});
            expect(hook.stepsTaken()).toBe(2 * YEAR);
        });

        it("reports a review only for the advance it fell due in", async () => {
            const hook = await cityWithoutAutoBudget();
            hook.advance(YEAR);

            expect(hook.advance(YEAR / 2)).toEqual({budgetReviewDue: false});
        });

        // Refused before anything is applied
        it.each([-1, 1.5, NaN])("takes a whole number of steps, not %s, and applies nothing otherwise", async (steps) => {
            const {hook, game} = await holdingGame();
            game.commandQueue.send(LOCAL_PLAYER, {type: "setAutoBudget", on: false});

            expect(() => hook.advance(steps)).toThrow(`Steps are taken in whole numbers, got ${steps}`);
            expect(game.applied).toEqual([]);
        });

        it("advances only while the driver is held", async () => {
            const {hook, game} = await holdingGame();
            hook.releaseDriver();

            expect(() => hook.advance(1)).toThrow("Advance needs the driver held");
            expect(game.simulation._speedCycle).toBe(0);
        });

        it("never steps a paused city", async () => {
            const {hook, game} = await holdingGame();
            game.simulation.setSpeed(Simulation.SPEED_PAUSED);

            expect(() => hook.advance(1)).toThrow("The city is not stepping: it is paused");
        });

        it("never steps a city paused by a command not yet applied", async () => {
            const {hook, game} = await holdingGame();
            game.commandQueue.send(LOCAL_PLAYER, {type: "setSpeed", speed: Simulation.SPEED_PAUSED});

            expect(() => hook.advance(1)).toThrow("The city is not stepping: it is paused");
            expect(hook.stepsTaken()).toBe(0);
        });

        it("never steps a city on a page that isn't showing", async () => {
            const {hook, game} = await holdingGame();
            game.pageShowing = false;

            expect(() => hook.advance(1)).toThrow("The city is not stepping: the page is hidden");
        });

        it("fails when city time falls short of the steps taken", async () => {
            const {hook, game} = await holdingGame();
            game.stepSimulation = () => undefined;

            expect(() => hook.advance(STEPS_PER_CITY_TIME)).toThrow(
                `The city stalled: ${STEPS_PER_CITY_TIME} steps should advance city time from 0 to 1, but it reached 0`);
        });

        it("counts every step taken, those of a failed advance too", async () => {
            const {hook, game} = await holdingGame();
            hook.advance(5);
            game.stepSimulation = () => undefined;

            expect(() => hook.advance(STEPS_PER_CITY_TIME)).toThrow("The city stalled");
            expect(hook.stepsTaken()).toBe(5 + STEPS_PER_CITY_TIME);
        });
    });

    it("saves what the game writes to storage", async () => {
        const {hook, currentVersion} = await loadTestHook();
        const game = gameOf(simulationFromSeed(1));
        hook.attach(game);

        expect(hook.save()).toEqual({...JSON.parse(JSON.stringify(game.saveData())), version: currentVersion});
    });

    // A command the simulation rejects is applied, and logged, all the same
    it("counts the commands the game has applied, rejected ones included", async () => {
        const {hook, game} = await holdingGame();
        game.commandQueue.send(LOCAL_PLAYER, {type: "setAutoBudget", on: false});
        game.commandQueue.send(LOCAL_PLAYER, {type: "noSuchCommand"});

        hook.applyInput();

        expect(hook.commandsApplied()).toBe(2);
        expect(game.applied).toHaveLength(2);
    });

    it("counts the commands an advance applies before its first step", async () => {
        const {hook, game} = await holdingGame();
        game.commandQueue.send(LOCAL_PLAYER, {type: "setAutoBudget", on: false});

        hook.advance(1);

        expect(hook.commandsApplied()).toBe(1);
    });

    it("counts only the newly started game's commands, from none", async () => {
        const {hook, game} = await holdingGame();
        game.commandQueue.send(LOCAL_PLAYER, {type: "setAutoBudget", on: false});
        hook.applyInput();

        hook.attach(gameOf(simulationFromSeed(2)));
        game.commandQueue.send(LOCAL_PLAYER, {type: "setAutoBudget", on: true});
        game.commandQueue.applyCommands();

        expect(hook.commandsApplied()).toBe(0);
    });

    it("tells where the view is", async () => {
        const {hook} = await holdingGame();

        expect(hook.view()).toEqual({originX: 3, originY: 4, tileWidth: 16});
    });
});
