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

import { cityFromSave, SaveData, Speed } from "../headless/city";
import { parseCommandLine } from "../headless/commandLine";
import { RUN_STEPS } from "../headless/fixtures/fixture";
import { fixtureNames } from "../headless/fixtures/index";
import { lineOf } from "../headless/fixtures/toolCommands";
import { run } from "../headless/run";
import {
    advance, fixtureLog, fixtureSave, replay, Start, startCity, startFromSave, summarise,
} from "../headless/runner";
import { canonicalJson } from "../src/canonicalJson";
import { parseLog } from "../src/commandLog";
import { LOCAL_PLAYER } from "../src/protocol";
import { plainSavedState, savedState, stateHash } from "../src/stateHash";
import { InspectedSave } from "./helpers/savedState";

describe("a fixture", () => {

    it.each(fixtureNames())("%s is a command log as a file holds one", (name) => {
        const log = fixtureLog(name);

        expect(parseLog(JSON.parse(JSON.stringify(log)))).toEqual(log);
    });

    // A fixture whose build silently skipped an edit would pin a different city than its log describes
    it.each(fixtureNames())("%s is built by commands that all succeed", (name) => {
        const {results} = replay(fixtureLog(name), {verify: false});

        expect(results).toHaveLength(fixtureLog(name).entries.length);
        expect(results.filter((result) => result.outcome !== "ok")).toEqual([]);
    });

    it.each(fixtureNames())("%s loads to exactly the state its log builds", (name) => {
        expect(canonicalJson(savedState(startCity({fixture: name}))))
            .toBe(canonicalJson(savedState(replay(fixtureLog(name), {to: 0, verify: false}).city)));
    });
});

describe("the runner", () => {

    it("starts a city from either a seed or a fixture", () => {
        expect(() => startCity({})).toThrow("either a seed or a fixture");
        expect(() => startCity({seed: 1, fixture: "town"})).toThrow("either a seed or a fixture");
    });

    it("reseeds only a fixture", () => {
        expect(() => startCity({seed: 1, reseed: 2})).toThrow("Reseeding replaces a fixture's stream");
    });

    it("names the fixtures when asked for one that doesn't exist", () => {
        expect(() => startCity({fixture: "nowhere"}))
            .toThrow(/^No fixture named nowhere: the fixtures are (\w+, )*town(, \w+)*$/);
    });

    // The hash sees the stream's state: two streams over the same city differ before a single step
    it("gives different hashes for the same fixture with two reseeds and no steps", async () => {
        const first = await summarise(startCity({fixture: "town", reseed: 1}));
        const second = await summarise(startCity({fixture: "town", reseed: 2}));

        expect(first.hash).not.toBe(second.hash);
    });

    it("gives a different hash when only the stream has moved", async () => {
        const city = startCity({fixture: "town"});
        const before = await stateHash(city);
        city.random.next();

        expect(await stateHash(city)).not.toBe(before);
    });

    it("keeps the fixture's saved stream unless told to reseed", () => {
        const city = startCity({fixture: "town"});

        expect(city.random.getState()).toEqual(fixtureSave("town").simulation.randomState);
    });

    it("overrides the saved speed when given one", () => {
        expect(startCity({fixture: "town", speed: "fast"}).getSpeed()).toBe(Speed.fast);
    });

    describe("given a fixture saved paused", () => {
        const pausedSave = () => {
            const saved = fixtureSave("town");
            return {...saved, simulation: {...saved.simulation, speed: Speed.paused}};
        };

        it("fails at once without a speed", () => {
            expect(() => startFromSave(pausedSave(), {})).toThrow("The city is saved paused: give a speed to run it");
        });

        it("runs at the speed it is given", () => {
            expect(startFromSave(pausedSave(), {speed: "slow"}).getSpeed()).toBe(Speed.slow);
        });

        it("is never stepped", () => {
            const city = cityFromSave(pausedSave());

            expect(() => advance(city, 1)).toThrow("a run never steps a paused simulation");
        });
    });

    it("takes a whole number of steps", () => {
        const city = startCity({fixture: "town"});

        expect(() => advance(city, -1)).toThrow("Steps are taken in whole numbers, got -1");
        expect(() => advance(city, 1.5)).toThrow("Steps are taken in whole numbers, got 1.5");
    });
});

describe("a run", () => {

    // A fast city runs a phase every step: 16 steps are one cycle, and one cycle is one unit of city time
    const STEPS_PER_YEAR_AT_FAST = 16 * 48;

    async function hashAfter(start: Start, steps: number) {
        const city = startCity(start);
        advance(city, steps);
        return (await summarise(city)).hash;
    }

    it("gives the same hash for the same fixture run twice", async () => {
        expect(await hashAfter({fixture: "town"}, 3000)).toBe(await hashAfter({fixture: "town"}, 3000));
    });

    it("gives the same hash for the same seed run twice", async () => {
        expect(await hashAfter({seed: 1234}, 1000)).toBe(await hashAfter({seed: 1234}, 1000));
    });

    it("gives a different hash for a different seed", async () => {
        expect(await hashAfter({seed: 1234}, 1000)).not.toBe(await hashAfter({seed: 1235}, 1000));
    });

    // N steps, save, load and M more steps end in the same state as one run of N + M steps. N stops mid-cycle and
    // between phases, with sprites in flight.
    it("continues from a save exactly as it would have without one", async () => {
        const N = 4001;
        const M = 3000;

        const uninterrupted = startCity({fixture: "town"});
        advance(uninterrupted, N + M);

        const first = startCity({fixture: "town"});
        advance(first, N);
        const saved = plainSavedState(first) as InspectedSave;
        expect(saved.simulation.phaseCycle).not.toBe(0);
        expect(saved.simulation.speedCycle % 3).not.toBe(0);
        expect(saved.sprites.list.length).toBeGreaterThan(0);

        const second = cityFromSave(saved);
        advance(second, M);

        expect(await stateHash(second)).toBe(await stateHash(uninterrupted));
    });

    // The values themselves are the golden hashes' business: this checks each field is read from the right place
    it("summarises the year, population and funds from the city", async () => {
        const city = startCity({fixture: "town", speed: "fast"});
        const startYear = city.getDate().year;
        advance(city, 2 * STEPS_PER_YEAR_AT_FAST);

        const summary = await summarise(city);
        expect(summary.year).toBe(startYear + 2);
        expect(summary.population).toBe(city.evaluation.cityPop);
        expect(summary.population).toBeGreaterThan(0);
        expect(summary.funds).toBe(city.budget.totalFunds);
    });

    // With auto-budget off, the year-end budget takes the player's values without waiting for them
    it("runs on through a year end with auto-budget off", () => {
        const saved = fixtureSave("town") as InspectedSave;
        const city = startFromSave({...saved, budget: {...saved.budget, autoBudget: false}} as SaveData,
                                   {speed: "fast"});

        expect(() => advance(city, 2 * STEPS_PER_YEAR_AT_FAST)).not.toThrow();
    });

    // A simulation whose steps do nothing, as one that stopped letting phases through would
    it("fails when city time doesn't advance as far as the steps imply", () => {
        const city = startCity({fixture: "town", speed: "fast"});
        city.step = () => {};

        expect(() => advance(city, 64))
            .toThrow("The city stalled: 64 steps should advance city time from 0 to 4, but it reached 0");
    });

    // Two whole speed cycles: each wrap from 1023 to 0 lets a phase through at slow and medium speed that the step
    // count alone wouldn't, which shows in the phase reached. City time advances on each cycle's phase 0, so p phases
    // from phase 0 reach city time ceil(p / 16) and phase p % 16.
    it.each([
        // 1023 / 5 rounded down, plus the wrap's: 205 phases per speed cycle, 410 in all
        ["slow", 26, 10],
        // 1023 / 3 plus the wrap's: 342 phases per speed cycle, 684 in all
        ["medium", 43, 12],
        // Every step: 2048 phases
        ["fast", 128, 0],
    ] as const)("reaches the city time and phase its steps imply at %s speed", (speed, cityTime, phase) => {
        const city = startCity({fixture: "town", speed});

        advance(city, 2048);

        expect([city._cityTime, city._phaseCycle]).toEqual([cityTime, phase]);
    });
});

describe("a fixture's tool commands", () => {

    it("lay only straight lines", () => {
        expect(() => lineOf("road", 12, 12, 14, 14)).toThrow("A road line must be horizontal or vertical");
    });
});

describe("the command line's replay of a log", () => {

    // The town's log, with a road off the map that the town's replay rejects and that changes nothing
    const townWithRejection = () => {
        const town = fixtureLog("town");
        const offMap = {step: 0, player: LOCAL_PLAYER, command: lineOf("road", -1, 0, -1, 0)};
        return {...town, entries: [...town.entries, offMap]};
    };
    const replayLog = (log: object) => run(["--log", "session.json"], () => JSON.stringify(log));

    it("counts its commands' outcomes and its checkpoints, and passes when they all match", async () => {
        const log = townWithRejection();
        const town = startCity({fixture: "town"});
        advance(town, RUN_STEPS);
        const summary = await summarise(town);

        expect(await replayLog(log)).toEqual({
            lines: [`${log.entries.length} commands: ${log.entries.length - 1} ok, 1 rejected`, "2 checkpoints match",
                    summary.hash, `year ${summary.year}, population ${summary.population}, funds ${summary.funds}`],
            failure: null,
        });
    });

    // As a log the browser saved without Web Crypto has none
    it("fails a log with no checkpoints, having verified nothing", async () => {
        const report = await replayLog({...townWithRejection(), checkpoints: []});

        expect(report.lines[0]).toMatch(/ 1 rejected$/);
        expect(report.lines.filter((line) => line.includes("checkpoints match"))).toEqual([]);
        expect(report.failure).toBe("The log has no checkpoints, so its replay verified nothing");
    });

    it("fails at a checkpoint that doesn't match", async () => {
        const log = townWithRejection();
        const checkpoints = [log.checkpoints[0], {...log.checkpoints[1], hash: "0".repeat(64)}];

        await expect(replayLog({...log, checkpoints})).rejects.toThrow(`At step ${RUN_STEPS} the replay's state hash`);
    });
});

describe("the command line", () => {

    it("reads a fixture run", () => {
        expect(parseCommandLine(["--fixture", "town", "--reseed", "5", "--speed", "fast", "--steps", "100"]))
            .toEqual({start: {fixture: "town", reseed: 5, speed: "fast", seed: undefined}, steps: 100});
    });

    it("reads a seed run", () => {
        expect(parseCommandLine(["--seed", "42", "--steps", "0"]))
            .toEqual({start: {seed: 42, fixture: undefined, reseed: undefined, speed: undefined}, steps: 0});
    });

    it("reads a log to replay", () => {
        expect(parseCommandLine(["--log", "session.json"])).toEqual({log: "session.json"});
    });

    it.each([
        [["--log", "session.json", "--steps", "10"], "--log replays a log as it stands, and takes no other option, got --steps"],
        [["--log", "session.json", "--seed", "1", "--speed", "fast"],
            "--log replays a log as it stands, and takes no other option, got --seed, --speed"],
        [["--seed", "1"], "--steps is required"],
        [["--seed", "1", "--steps", "3.5"], "--steps takes a whole number, got 3.5"],
        [["--seed", "x", "--steps", "1"], "--seed takes a whole number, got x"],
        [["--seed", "1", "--steps", "1", "--speed", "paused"], "--speed is one of slow, medium, fast, got paused"],
        [["--seed", "1", "--steps", "1", "--colour", "red"], "Unknown option '--colour'"],
    ])("rejects %j", (args, message) => {
        expect(() => parseCommandLine(args)).toThrow(message);
    });
});
