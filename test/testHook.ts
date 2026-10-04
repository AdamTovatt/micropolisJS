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

import type { CityDriver, CitySource } from "../src/citySource";
import { CityState } from "../src/cityState";
import { AdvanceResult, Command, SPEEDS } from "../src/protocol";
import { attachDriverToTestHook, installTestHook, TestHook } from "../src/testHook";
import { expectPlayedThrough, playback } from "./helpers/fakeCitySource";
import { restoreGlobals, stubGlobal } from "./helpers/globals";
import { STEPS_PER_CITY_TIME, YEAR } from "./helpers/cityTimes";
import { BranchName, NEW_CITY, openTown, ROAD, UNKNOWN_COMMAND } from "./recordings/scenarios";

// The hook's own work, over a source playing back a recording of the server. How the source holds, flushes and
// advances the city, and why an advance fails, is the source's, which the contract tests pin (test/citySource.ts).

// A game as the hook sees it, around a source and the client's copy of its city. Tool paths the player has drawn wait
// for the game to send them, as the game's do until its next tick.
// How far the fake games' views may move
const LIMITS = {minX: -40, maxX: 79, minY: -30, maxY: 69};

function gameOn(source: CitySource, state: CityState) {
    const game = {
        toolPaths: [] as Command[],
        sendToolPaths: () => {
            game.toolPaths.splice(0).forEach((command) => source.send(command));
        },
        onCommandResult: (listener: () => void) => state.on("commandResult", listener),
        // Not the tile set's 16 pixels, so the view's tile width is seen to be the canvas's
        gameCanvas: {getTileOrigin: () => ({x: 3, y: 4}), getOriginLimits: () => LIMITS, tileWidth: 32,
                     mapCurrent: false},
        dismissals: 0,
        notificationBar: {dismiss: () => {
            game.dismissals++;
        }},
    };

    return game;
}

// A game with no city behind it, for a hook whose driver is fake
const IDLE_GAME = {
    sendToolPaths: () => {},
    onCommandResult: () => {},
    gameCanvas: {getTileOrigin: () => ({x: 0, y: 0}), getOriginLimits: () => LIMITS, tileWidth: 16, mapCurrent: true},
    notificationBar: {dismiss: () => {}},
};

// The hook on the source, with its driver attached, and the client's copy of the source's city. What the hook sends,
// and when, is checked by the fake, which refuses any call but the recording's next
function hooked(source: CitySource) {
    const state = new CityState(source);
    const hook = new TestHook();
    hook.attachDriver(source.driver);

    return {hook, source, state};
}

// The hook holding the driver of a new city, which it held before the city started
async function holdingGame(branch: BranchName<"newCity">) {
    const hooks = hooked(playback("newCity", branch));
    await hooks.hook.holdDriver();
    await hooks.source.start(NEW_CITY);

    const game = gameOn(hooks.source, hooks.state);
    hooks.hook.attach(game);
    return {...hooks, game};
}

// The town, with residents, a year in, with auto-budget off, so that its next year end offers the budget to review
async function townWithoutAutoBudget(branch: BranchName<"town">) {
    const {hook, source, state} = hooked(playback("town", branch));
    await openTown(source);
    hook.attach(gameOn(source, state));
    await hook.advance(YEAR);
    source.send({type: "setAutoBudget", on: false});

    return hook;
}

// An advance that took no steps, for a driver whose advances the test doesn't look at
const NO_STEPS: AdvanceResult = {steps: 0, budgetReviewDue: false, error: null};

// A driver that answers every advance with the result given, and records what it was asked
class FakeDriver implements CityDriver {
    readonly advances: number[] = [];
    private held = false;

    constructor(private readonly result: AdvanceResult, private readonly saved = "") {}

    isHeld(): boolean {
        return this.held;
    }

    async hold(): Promise<void> {
        this.held = true;
    }

    async release(): Promise<void> {
        this.held = false;
    }

    async flush(): Promise<void> {}
    async cityTime(): Promise<number> {
        return 0;
    }

    async savedGame(): Promise<string> {
        return this.saved;
    }

    async advance(steps: number): Promise<AdvanceResult> {
        this.advances.push(steps);
        return this.result;
    }
}

describe("the test hook", () => {

    afterEach(expectPlayedThrough);

    // The page installs the hook and attaches its source's driver as it starts, before it starts or joins any city
    describe("as the page starts", () => {

        afterEach(() => {
            restoreGlobals();
        });

        // The page's window, with the runner's request to hold, if it made one, and the hook the page installs on it
        function startingPage(holdRequested: boolean, driver: CityDriver): TestHook {
            stubGlobal("window", {});
            if (holdRequested) {
                window.micropolisHoldDriverAtStart = true;
            }

            installTestHook();
            attachDriverToTestHook(driver);
            return window.micropolisTestHook!;
        }

        it("holds the driver there and then when the runner asked it to", async () => {
            const driver = new FakeDriver(NO_STEPS);

            const hook = startingPage(true, driver);

            expect(driver.isHeld()).toBe(true);
            await expect(hook.untilHeldAtStart()).resolves.toBeUndefined();
        });

        it("leaves the driver alone when the runner didn't ask, and says so to a runner waiting on the hold", async () => {
            const driver = new FakeDriver(NO_STEPS);

            const hook = startingPage(false, driver);

            expect(driver.isHeld()).toBe(false);
            await expect(hook.untilHeldAtStart()).rejects.toThrow("The page started without holding its driver");
        });

        it("fails a runner waiting on a hold that failed, as it failed", async () => {
            const driver = new FakeDriver(NO_STEPS);
            driver.hold = () => Promise.reject(new Error("The connection to the server is down"));

            const hook = startingPage(true, driver);

            await expect(hook.untilHeldAtStart()).rejects.toThrow("The connection to the server is down");
        });
    });

    describe("before a game has started", () => {

        it.each(["applyInput", "advance", "save", "cityTime"])("can't %s", async (method) => {
            const hook = new TestHook();
            hook.attachDriver(new FakeDriver(NO_STEPS));
            const call = {
                applyInput: () => hook.applyInput(),
                advance: () => hook.advance(1),
                save: () => hook.save(),
                cityTime: () => hook.cityTime(),
            }[method]!;

            await expect(call()).rejects.toThrow("No game has started");
        });

        it.each(["view", "commandsApplied", "dismissNotification", "mapCurrent"])("can't %s", (method) => {
            const hook = new TestHook();
            const call = {view: () => hook.view(), commandsApplied: () => hook.commandsApplied(),
                          dismissNotification: () => hook.dismissNotification(),
                          mapCurrent: () => hook.mapCurrent()}[method]!;

            expect(call).toThrow("No game has started");
        });

        // So the source's first city doesn't step until the runner advances it. That the hold came before the start is
        // the recording's order, which the fake holds the calls to; isHeld is the source's own flag.
        it("holds the source's driver before the city starts", async () => {
            const {source} = await holdingGame("nothing");

            expect(source.driver.isHeld()).toBe(true);
        });
    });

    // The release the branch recorded must be made, or the check that the branch was played through fails
    it("releases the source's driver", async () => {
        const {hook, source} = await holdingGame("release");

        await hook.releaseDriver();

        expect(source.driver.isHeld()).toBe(false);
    });

    // An advance applies them before its first step, as the game's next tick would have, had it run before the advance.
    // The fake holds the hook to the recording's order: both commands sent, then the flush or the advance.
    it.each([
        ["applyInput", "input, then flush" as const, (hook: TestHook) => hook.applyInput()],
        ["advance", "input, then advance" as const, (hook: TestHook) => hook.advance(5)],
    ])("applies the commands sent, and the tool paths yet to be sent, before any step, through %s",
       async (_, branch, act) => {
        const {hook, game, source} = await holdingGame(branch);
        await hook.advance(5);
        source.send({type: "setAutoBudget", on: false});
        game.toolPaths.push(ROAD);

        await act(hook);

        expect(game.toolPaths).toEqual([]);
    });

    describe("advancing", () => {

        it("advances the city by the steps asked, at its own speed", async () => {
            const {hook} = await holdingGame("ten city times");

            expect(await hook.advance(10 * STEPS_PER_CITY_TIME)).toEqual({budgetReviewDue: false});

            expect(await hook.cityTime()).toBe(10);
            expect(hook.stepsTaken()).toBe(10 * STEPS_PER_CITY_TIME);
        });

        it("reports a year-end budget review that fell due, and takes every step regardless", async () => {
            const hook = await townWithoutAutoBudget("a year, auto-budget off, a year");

            expect(await hook.advance(YEAR)).toEqual({budgetReviewDue: true});
            expect(hook.stepsTaken()).toBe(2 * YEAR);
        });

        it("reports a review only for the advance it fell due in", async () => {
            const hook = await townWithoutAutoBudget("a year, auto-budget off, a year and a half");
            await hook.advance(YEAR);

            expect(await hook.advance(YEAR / 2)).toEqual({budgetReviewDue: false});
        });

        // Refused before anything is sent
        it.each([-1, 1.5, NaN])("takes a whole number of steps, not %s, and sends nothing otherwise", async (steps) => {
            const {hook, game, source} = await holdingGame("flush");
            game.toolPaths.push({type: "setAutoBudget", on: false});

            await expect(hook.advance(steps)).rejects.toThrow(`Steps are taken in whole numbers, got ${steps}`);

            expect(game.toolPaths).toEqual([{type: "setAutoBudget", on: false}]);
            // The recording's next call: the fake would have refused a command the hook sent, or an advance
            await source.driver.flush();
        });

        it("advances only while the driver is held", async () => {
            const {hook} = await holdingGame("release");
            await hook.releaseDriver();

            await expect(hook.advance(1)).rejects.toThrow("Advance needs the driver held");
            expect(hook.stepsTaken()).toBe(0);
        });

        it("fails an advance of a paused city with the source's reason", async () => {
            const {hook, source} = await holdingGame("pause, flush, advance");
            source.send({type: "setSpeed", speed: SPEEDS.paused});
            await hook.applyInput();

            await expect(hook.advance(1)).rejects.toThrow("The city is not stepping: it is paused");
        });

        it("fails an advance of a city paused by a command not yet applied", async () => {
            const {hook, source} = await holdingGame("pause, advance");
            source.send({type: "setSpeed", speed: SPEEDS.paused});

            await expect(hook.advance(1)).rejects.toThrow("The city is not stepping: it is paused");
            expect(hook.stepsTaken()).toBe(0);
        });

        it("counts the steps the driver reports, whatever it says of the advance", async () => {
            const hook = new TestHook();
            const driver = new FakeDriver({steps: 7, budgetReviewDue: false, error: "the city stalled"});
            hook.attachDriver(driver);
            hook.attach(IDLE_GAME);
            await hook.holdDriver();

            await expect(hook.advance(9)).rejects.toThrow("the city stalled");
            expect(driver.advances).toEqual([9]);
            expect(hook.stepsTaken()).toBe(7);
        });
    });

    it("reads the save from the driver, as the object it is", async () => {
        const hook = new TestHook();
        hook.attachDriver(new FakeDriver(NO_STEPS, JSON.stringify({name: "Town", version: 10})));
        hook.attach(IDLE_GAME);

        expect(await hook.save()).toEqual({name: "Town", version: 10});
    });

    // A command the simulation rejects is applied, and logged, all the same
    it("counts the commands the game has applied, rejected ones included", async () => {
        const {hook, source} = await holdingGame("auto-budget off, an unknown command, flush");
        source.send({type: "setAutoBudget", on: false});
        source.send(UNKNOWN_COMMAND);

        await hook.applyInput();

        expect(hook.commandsApplied()).toBe(2);
    });

    it("counts the commands an advance applies before its first step", async () => {
        const {hook, source} = await holdingGame("auto-budget off, advance");
        source.send({type: "setAutoBudget", on: false});

        await hook.advance(1);

        expect(hook.commandsApplied()).toBe(1);
    });

    it("counts only the commands applied since the game it last attached, each once", async () => {
        const {hook, source, state} = await holdingGame("auto-budget off, flush, on, flush");
        source.send({type: "setAutoBudget", on: false});
        await hook.applyInput();

        hook.attach(gameOn(source, state));
        expect(hook.commandsApplied()).toBe(0);

        source.send({type: "setAutoBudget", on: true});
        await hook.applyInput();
        expect(hook.commandsApplied()).toBe(1);
    });

    it("tells where the view is, and the canvas's tile width", async () => {
        const {hook} = await holdingGame("nothing");

        expect(hook.view()).toEqual({originX: 3, originY: 4, limits: LIMITS, tileWidth: 32});
    });

    it("tells whether the canvas's map is current", async () => {
        const {hook, game} = await holdingGame("nothing");
        const behind = hook.mapCurrent();
        game.gameCanvas.mapCurrent = true;

        expect([behind, hook.mapCurrent()]).toEqual([false, true]);
    });

    it("dismisses the game's notification bar", async () => {
        const {hook, game} = await holdingGame("nothing");

        hook.dismissNotification();

        expect(game.dismissals).toBe(1);
    });
});
