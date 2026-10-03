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
import type { AdvanceResult, CityDriver, CityStart } from "../src/citySource";
import { CityState } from "../src/cityState";
import { PageCitySource } from "../src/pageCitySource";
import { Command } from "../src/protocol";
import { SaveFormat } from "../src/savedGame";
import { Simulation } from "../src/simulation.js";
import { plainSavedState } from "../src/stateHash";
import { TestHook } from "../src/testHook";
import { ManualTicker } from "./helpers/manualTicker";
import { buildCity, YEAR } from "./helpers/simulations";

const STEPS_PER_CITY_TIME = stepsPerCityTime(Simulation.SPEED_MED);

// A game as the hook sees it, around an in-page source and the client's copy of its city. Tool paths the player has
// drawn wait for the game to send them, as the game's do until its next tick.
function gameOn(source: PageCitySource, state: CityState) {
    const game = {
        toolPaths: [] as Command[],
        sendToolPaths: () => {
            game.toolPaths.splice(0).forEach((command) => source.send(command));
        },
        save: () => source.save(),
        onCommandResult: (listener: () => void) => state.on("commandResult", listener),
        gameCanvas: {getTileOrigin: () => ({x: 3, y: 4})},
        tileSet: {tileWidth: 16},
    };

    return game;
}

// A game with no city behind it, for a hook whose driver is fake
const IDLE_GAME = {
    sendToolPaths: () => {},
    save: async () => "",
    onCommandResult: () => {},
    gameCanvas: {getTileOrigin: () => ({x: 0, y: 0})},
    tileSet: {tileWidth: 16},
};

// A hook on an in-page source whose loop the test runs by hand, holding its driver, with a game on a new city. results
// lists the commands the source has applied, in order.
async function holdingGame(start: CityStart = {name: "Town", seed: 1, level: 0}) {
    const ticker = new ManualTicker();
    const source = new PageCitySource(ticker, false);
    const state = new CityState(source);
    const hook = new TestHook();
    hook.attachDriver(source.driver);
    await hook.holdDriver();
    await source.start(start);

    const game = gameOn(source, state);
    hook.attach(game);
    const results: unknown[] = [];
    state.on("commandResult", ({result}) => results.push(result.command));

    return {hook, game, source, state, ticker, results};
}

// A city with residents, a year in, with auto-budget off, so that its next year end offers the budget to review
async function cityWithoutAutoBudget() {
    const city = buildCity(1, 1);
    const {hook, source} = await holdingGame({save: SaveFormat.serialise({...plainSavedState(city), name: "Town"})});
    await hook.advance(YEAR);
    source.send({type: "setAutoBudget", on: false});

    return hook;
}

// A driver that answers every advance with the result given, and records what it was asked
class FakeDriver implements CityDriver {
    readonly advances: number[] = [];
    private held = false;

    constructor(private readonly result: AdvanceResult) {}

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

    async advance(steps: number): Promise<AdvanceResult> {
        this.advances.push(steps);
        return this.result;
    }
}

describe("the test hook", () => {

    describe("before a game has started", () => {

        it.each(["applyInput", "advance", "save", "cityTime"])("can't %s", async (method) => {
            const hook = new TestHook();
            hook.attachDriver(new FakeDriver({steps: 0, budgetReviewDue: false, error: null}));
            const call = {
                applyInput: () => hook.applyInput(),
                advance: () => hook.advance(1),
                save: () => hook.save(),
                cityTime: () => hook.cityTime(),
            }[method]!;

            await expect(call()).rejects.toThrow("No game has started");
        });

        it.each(["view", "commandsApplied"])("can't tell %s", (method) => {
            const hook = new TestHook();
            const call = {view: () => hook.view(), commandsApplied: () => hook.commandsApplied()}[method]!;

            expect(call).toThrow("No game has started");
        });

        // The source's first city doesn't step until the runner advances it
        it("holds the driver of a city that starts after the hold", async () => {
            const {ticker, source} = await holdingGame();

            ticker.run(1000);

            expect(await source.driver.cityTime()).toBe(0);
            expect(source.driver.isHeld()).toBe(true);
        });
    });

    it("releases the driver, and the city steps in real time again", async () => {
        const {hook, ticker, source} = await holdingGame();

        await hook.releaseDriver();
        ticker.run();
        ticker.run(STEPS_PER_CITY_TIME * 1000 / 60);

        expect(source.driver.isHeld()).toBe(false);
        expect(await source.driver.cityTime()).toBe(1);
    });

    // While the driver is held, the source's loop applies no commands: the runner does
    it("leaves the commands sent to the runner while it holds the driver", async () => {
        const {ticker, source, results} = await holdingGame();

        source.send({type: "setAutoBudget", on: false});
        ticker.run(1000);

        expect(results).toEqual([]);
    });

    // An advance applies them before its first step, as the game's next tick would have, had it run before the advance
    it.each([
        ["applyInput", (hook: TestHook) => hook.applyInput()],
        ["advance", (hook: TestHook) => hook.advance(5)],
    ])("applies the commands sent, and the tool paths yet to be sent, before any step, through %s", async (_, act) => {
        const {hook, game, source, results} = await holdingGame();
        await hook.advance(5);
        const road: Command = {type: "tool", tool: "road", path: [{x: 10, y: 10}], autoBulldoze: true};
        source.send({type: "setAutoBudget", on: false});
        game.toolPaths.push(road);

        await act(hook);

        expect(results).toEqual([{type: "setAutoBudget", on: false}, road]);
        expect(game.toolPaths).toEqual([]);
        expect((await source.commandLog()).log).toMatchObject({entries: [
            {step: 5, command: {type: "setAutoBudget", on: false}}, {step: 5, command: road},
        ]});
    });

    describe("advancing", () => {

        it("advances the city by the steps asked, at its own speed", async () => {
            const {hook} = await holdingGame();

            expect(await hook.advance(10 * STEPS_PER_CITY_TIME)).toEqual({budgetReviewDue: false});

            expect(await hook.cityTime()).toBe(10);
            expect(hook.stepsTaken()).toBe(10 * STEPS_PER_CITY_TIME);
        });

        it("reports a year-end budget review that fell due, and takes every step regardless", async () => {
            const hook = await cityWithoutAutoBudget();

            expect(await hook.advance(YEAR)).toEqual({budgetReviewDue: true});
            expect(hook.stepsTaken()).toBe(2 * YEAR);
        });

        it("reports a review only for the advance it fell due in", async () => {
            const hook = await cityWithoutAutoBudget();
            await hook.advance(YEAR);

            expect(await hook.advance(YEAR / 2)).toEqual({budgetReviewDue: false});
        });

        // Refused before anything is sent
        it.each([-1, 1.5, NaN])("takes a whole number of steps, not %s, and sends nothing otherwise", async (steps) => {
            const {hook, game, source, results} = await holdingGame();
            game.toolPaths.push({type: "setAutoBudget", on: false});

            await expect(hook.advance(steps)).rejects.toThrow(`Steps are taken in whole numbers, got ${steps}`);

            expect(game.toolPaths).toEqual([{type: "setAutoBudget", on: false}]);
            await source.driver.flush();
            expect(results).toEqual([]);
        });

        it("advances only while the driver is held", async () => {
            const {hook} = await holdingGame();
            await hook.releaseDriver();

            await expect(hook.advance(1)).rejects.toThrow("Advance needs the driver held");
            expect(hook.stepsTaken()).toBe(0);
        });

        it("never steps a paused city", async () => {
            const {hook, source} = await holdingGame();
            source.send({type: "setSpeed", speed: Simulation.SPEED_PAUSED});
            await hook.applyInput();

            await expect(hook.advance(1)).rejects.toThrow("The city is not stepping: it is paused");
        });

        it("never steps a city paused by a command not yet applied", async () => {
            const {hook, source} = await holdingGame();
            source.send({type: "setSpeed", speed: Simulation.SPEED_PAUSED});

            await expect(hook.advance(1)).rejects.toThrow("The city is not stepping: it is paused");
            expect(hook.stepsTaken()).toBe(0);
        });

        it("never steps a city the player can't see", async () => {
            const {hook, source} = await holdingGame();
            source.setViewerVisible(false);

            await expect(hook.advance(1)).rejects.toThrow("The city is not stepping: the player can't see it");
        });

        it("counts every step taken, those of a failed advance too", async () => {
            const {hook} = await holdingGame();
            await hook.advance(5);
            const stalled = jest.spyOn(Simulation.prototype, "step").mockImplementation(() => undefined);

            try {
                await expect(hook.advance(STEPS_PER_CITY_TIME)).rejects.toThrow("The city stalled");
            } finally {
                stalled.mockRestore();
            }

            expect(hook.stepsTaken()).toBe(5 + STEPS_PER_CITY_TIME);
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

    it("saves what the game writes to storage", async () => {
        const {hook, game} = await holdingGame();

        expect(await hook.save()).toEqual(JSON.parse(await game.save()));
        expect(await hook.save()).toMatchObject({name: "Town", version: SaveFormat.CURRENT_VERSION});
    });

    // A command the simulation rejects is applied, and logged, all the same
    it("counts the commands the game has applied, rejected ones included", async () => {
        const {hook, source} = await holdingGame();
        source.send({type: "setAutoBudget", on: false});
        source.send({type: "noSuchCommand"} as unknown as Command);

        await hook.applyInput();

        expect(hook.commandsApplied()).toBe(2);
    });

    it("counts the commands an advance applies before its first step", async () => {
        const {hook, source} = await holdingGame();
        source.send({type: "setAutoBudget", on: false});

        await hook.advance(1);

        expect(hook.commandsApplied()).toBe(1);
    });

    it("counts only the commands applied since the game it last attached, each once", async () => {
        const {hook, source, state} = await holdingGame();
        source.send({type: "setAutoBudget", on: false});
        await hook.applyInput();

        hook.attach(gameOn(source, state));
        expect(hook.commandsApplied()).toBe(0);

        source.send({type: "setAutoBudget", on: true});
        await hook.applyInput();
        expect(hook.commandsApplied()).toBe(1);
    });

    it("tells where the view is", async () => {
        const {hook} = await holdingGame();

        expect(hook.view()).toEqual({originX: 3, originY: 4, tileWidth: 16});
    });
});
