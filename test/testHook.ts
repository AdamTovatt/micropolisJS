/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

import type { Cars, PaintableCar } from "../src/cars";
import type { CityDriver, CitySource } from "../src/citySource";
import { CityState } from "../src/cityState";
import { AdvanceResult, BudgetForecastAnswer, Command, EvaluationRecord, FireStationReach, SPEEDS, StatusRecord,
         TilePosition, TileReportAnswer, Trip } from "../src/protocol";
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

const EVALUATION: EvaluationRecord = {
    type: "evaluation", approval: 40, problems: [0, 4], population: 2400, migration: 120, assessedValue: 90000,
    cityClass: "VILLAGE", level: 0, score: 480, scoreDelta: -20, scoreBreakdown: [{reason: "TAXES", points: -20}],
};

const FORECAST: BudgetForecastAnswer = {
    type: "budgetForecast",
    budget: {type: "budget", taxRate: 7, taxesCollected: 900, funds: 5000, maintenance: {road: 300, fire: 100, police: 100},
             funding: {road: 1, fire: 1, police: 1}},
    costs: {road: 300, fire: 100, police: 100}, taxes: 900, fundsChange: 400, fundsAfterYear: 5400,
};

const REPORT: TileReportAnswer = {
    type: "tileReport", x: 4, y: 5, tile: 244, category: "RESIDENTIAL", populationDensity: 0, landValue: 90, crime: 0,
    pollution: 10, rateOfGrowth: 0, burnable: true, bulldozable: true, conductive: true, animated: false, powered: true,
    zoneCentre: true, fireStationMap: 0, fireCoverage: 0, policeStationMap: 0, policeCoverage: 0, terrainDensity: 0,
    trafficDensity: 0, cityCentreScore: 0,
    growth: {zone: "RESIDENTIAL", x: 4, y: 5, score: -320, outlook: "LIKELY_TO_GROW", assessedNowAndThen: false,
             roadAtEdge: true, blockers: ["LOW_LAND_VALUE"]},
};

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
        monsterTV: {current: false},
        carsAdded: [] as Parameters<Cars["add"]>[0][],
        cars: {driven: () => [0, 0.5], add: (routes: Parameters<Cars["add"]>[0]) => {
            game.carsAdded.push(routes);
        }},
        carsPainted: [
            {kind: "rail", x: 0, y: 0, width: 16, direction: "east"},
            {kind: "road", x: 16, y: 0, width: 16, direction: "east", colour: 0},
            {kind: "rail", x: 32, y: 0, width: 16, direction: "east"},
        ] as PaintableCar[],
        frameCounts: {animated: 30, painted: 12},
        dismissals: 0,
        notificationBar: {dismiss: () => {
            game.dismissals++;
        }},
        toastDismissals: 0,
        toolToast: {dismiss: () => {
            game.toastDismissals++;
        }},
        statuses: [] as StatusRecord[],
        statusPanel: {show: (status: StatusRecord) => {
            game.statuses.push(status);
        }},
        forecasts: [] as BudgetForecastAnswer[],
        budgetWindow: {write: (forecast: BudgetForecastAnswer) => {
            game.forecasts.push(forecast);
        }},
        evaluations: [] as EvaluationRecord[],
        evaluationWindow: {write: (record: EvaluationRecord) => {
            game.evaluations.push(record);
        }},
        reports: [] as TileReportAnswer[],
        queryWindow: {write: (report: TileReportAnswer) => {
            game.reports.push(report);
        }},
        hoverTile: {x: 7, y: 9} as {x: number, y: number} | null,
    };

    return game;
}

// A game with no city behind it, for a hook whose driver is fake
const IDLE_GAME = {
    sendToolPaths: () => {},
    onCommandResult: () => {},
    gameCanvas: {getTileOrigin: () => ({x: 0, y: 0}), getOriginLimits: () => LIMITS, tileWidth: 16, mapCurrent: true},
    monsterTV: {current: true},
    cars: {driven: () => [], add: () => {}},
    carsPainted: [],
    frameCounts: {animated: 0, painted: 0},
    notificationBar: {dismiss: () => {}},
    toolToast: {dismiss: () => {}},
    statusPanel: {show: () => {}},
    budgetWindow: {write: () => {}},
    evaluationWindow: {write: () => {}},
    queryWindow: {write: () => {}},
    hoverTile: null,
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

// What the fake driver answers of the city's state hash and of any fire station's reach
const HASH = "c".repeat(64);
const REACH: FireStationReach = {perimeter: [{x: 0, y: 0, cover: 111}]};

// A driver that answers every advance with the result given, and records what it was asked
class FakeDriver implements CityDriver {
    readonly advances: number[] = [];
    // The station and the target of each reach asked for
    readonly reaches: [TilePosition, TilePosition][] = [];
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

    async stateHash(): Promise<string> {
        return HASH;
    }

    async fireStationReach(station: TilePosition, target: TilePosition): Promise<FireStationReach> {
        this.reaches.push([station, target]);
        return REACH;
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

        it.each(["applyInput", "advance", "save", "cityTime", "stateHash", "fireStationReach"])("can't %s", async (method) => {
            const hook = new TestHook();
            hook.attachDriver(new FakeDriver(NO_STEPS));
            const call = {
                applyInput: () => hook.applyInput(),
                advance: () => hook.advance(1),
                save: () => hook.save(),
                cityTime: () => hook.cityTime(),
                stateHash: () => hook.stateHash(),
                fireStationReach: () => hook.fireStationReach({x: 1, y: 2}, {x: 3, y: 4}),
            }[method]!;

            await expect(call()).rejects.toThrow("No game has started");
        });

        it.each(["view", "commandsApplied", "dismissNotification", "showStatus", "showEvaluation", "showBudgetForecast",
                 "showTileReport", "viewsCurrent"])("can't %s", (method) => {
            const hook = new TestHook();
            const call = {view: () => hook.view(), commandsApplied: () => hook.commandsApplied(),
                          dismissNotification: () => hook.dismissNotification(),
                          showStatus: () => hook.showStatus({type: "status", powerCapacity: 0, powerLoad: 0,
                                                             residentialCapped: false, commercialCapped: false,
                                                             industrialCapped: false, conditions: []}),
                          showEvaluation: () => hook.showEvaluation(EVALUATION),
                          showBudgetForecast: () => hook.showBudgetForecast(FORECAST),
                          showTileReport: () => hook.showTileReport(REPORT),
                          viewsCurrent: () => hook.viewsCurrent()}[method]!;

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

    it("reads the state hash and a fire station's reach from the driver", async () => {
        const hook = new TestHook();
        const driver = new FakeDriver(NO_STEPS);
        hook.attachDriver(driver);
        hook.attach(IDLE_GAME);

        expect(await hook.stateHash()).toBe(HASH);
        expect(await hook.fireStationReach({x: 1, y: 2}, {x: 3, y: 4})).toEqual(REACH);
        expect(driver.reaches).toEqual([[{x: 1, y: 2}, {x: 3, y: 4}]]);
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

    it("tells the map tile the player's hover box is drawn at, or none", async () => {
        const {hook, game} = await holdingGame("nothing");
        const shown = hook.hoverTile();
        game.hoverTile = null;

        expect([shown, hook.hoverTile()]).toEqual([{x: 7, y: 9}, null]);
    });

    it("tells how far each car driving has driven, and how many the map's view shows, and of them of trains", async () => {
        const {hook} = await holdingGame("nothing");

        expect([hook.carsDriven(), hook.carsInView(), hook.trainCarsInView()]).toEqual([[0, 0.5], 3, 2]);
    });

    it("adds the cars the runner asks for to those driving", async () => {
        const {hook, game} = await holdingGame("nothing");
        const trip: Trip = [1, 1, "EES"];

        hook.addCars([trip]);

        expect(game.carsAdded).toEqual([[trip]]);
    });

    it("tells the turns of the animation loop and the frames the map's painter drew", async () => {
        const {hook} = await holdingGame("nothing");

        expect(hook.frameCounts()).toEqual({animated: 30, painted: 12});
    });

    it("tells whether the map and the monster TV are both current", async () => {
        const {hook, game} = await holdingGame("nothing");
        const bothBehind = hook.viewsCurrent();
        game.gameCanvas.mapCurrent = true;
        const tvBehind = hook.viewsCurrent();
        game.monsterTV.current = true;
        const both = hook.viewsCurrent();
        game.gameCanvas.mapCurrent = false;

        expect([bothBehind, tvBehind, both, hook.viewsCurrent()]).toEqual([false, false, true, false]);
    });

    it("dismisses the game's notification bar and tool toast", async () => {
        const {hook, game} = await holdingGame("nothing");

        hook.dismissNotification();

        expect([game.dismissals, game.toastDismissals]).toEqual([1, 1]);
    });

    it("shows a status record in the game's status panel", async () => {
        const {hook, game} = await holdingGame("nothing");
        const status: StatusRecord = {type: "status", powerCapacity: 700, powerLoad: 920, residentialCapped: true,
                                      commercialCapped: false, industrialCapped: true, conditions: []};

        hook.showStatus(status);

        expect(game.statuses).toEqual([status]);
    });

    it("writes an evaluation record into the game's evaluation window", async () => {
        const {hook, game} = await holdingGame("nothing");

        hook.showEvaluation(EVALUATION);

        expect(game.evaluations).toEqual([EVALUATION]);
    });

    it("writes a forecast into the game's budget window", async () => {
        const {hook, game} = await holdingGame("nothing");

        hook.showBudgetForecast(FORECAST);

        expect(game.forecasts).toEqual([FORECAST]);
    });

    it("writes a tile report into the game's query window", async () => {
        const {hook, game} = await holdingGame("nothing");

        hook.showTileReport(REPORT);

        expect(game.reports).toEqual([REPORT]);
    });
});
