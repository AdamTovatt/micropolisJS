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
import { parseCommandLine } from "../headless/commandLine";
import { buildFixture, CityBuilder } from "../headless/fixtures/builder";
import { fixtureNames, fixtures, fixtureSave } from "../headless/fixtures/index";
import { advance, Start, startCity, startFromSave, summarise } from "../headless/runner";
import { BaseTool } from "../src/baseTool.js";
import { canonicalJson } from "../src/canonicalJson";
import { plainSavedState, savedState, stateHash } from "../src/stateHash";
import { InspectedSave } from "./helpers/savedState";

describe("a fixture", () => {

    it.each(fixtureNames())("%s loads to exactly the state its script builds", (name) => {
        expect(canonicalJson(savedState(startCity({fixture: name}))))
            .toBe(canonicalJson(savedState(buildFixture(fixtures[name]))));
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
        expect(() => startCity({fixture: "nowhere"})).toThrow("No fixture named nowhere: the fixtures are town");
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

        expect(city.random.getState()).toEqual(fixtureSave("town").randomState);
    });

    it("overrides the saved speed when given one", () => {
        expect(startCity({fixture: "town", speed: "fast"}).getSpeed()).toBe(Speed.fast);
    });

    describe("given a fixture saved paused", () => {
        const pausedSave = () => ({...fixtureSave("town"), _speed: Speed.paused});

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

        expect(() => advance(city, -1)).toThrow("A run takes a whole number of steps, got -1");
        expect(() => advance(city, 1.5)).toThrow("A run takes a whole number of steps, got 1.5");
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
        expect(saved._phaseCycle).not.toBe(0);
        expect(saved._speedCycle % 3).not.toBe(0);
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

    // With auto-budget off, the year-end budget waits for the player
    it("fails when the simulation stops for the player's budget", () => {
        const city = startFromSave({...fixtureSave("town"), autoBudget: false} as SaveData, {speed: "fast"});

        expect(() => advance(city, STEPS_PER_YEAR_AT_FAST))
            .toThrow("The simulation stopped for the player's budget");
    });

    // Saved while waiting for the player's budget, so the city never sends BUDGET_NEEDED during the run
    it("fails when city time doesn't advance as far as the steps imply", () => {
        const saved = fixtureSave("town") as InspectedSave;
        const city = startFromSave({...saved, budget: {...saved.budget, awaitingValues: true}} as SaveData,
                                   {speed: "fast"});

        expect(() => advance(city, 64))
            .toThrow("The simulation stalled: 64 steps should advance city time from 0 to 4, but it reached 0");
    });

    // Two whole speed cycles: each wrap from 1023 to 0 lets a phase through at slow and medium speed that the step
    // count alone wouldn't, which shows in the phase reached
    it.each([
        ["slow", 26, 10],
        ["medium", 43, 12],
        ["fast", 128, 0],
    ] as const)("reaches the city time and phase its steps imply at %s speed", (speed, cityTime, phase) => {
        const city = startCity({fixture: "town", speed});

        advance(city, 2048);

        expect([city._cityTime, city._phaseCycle]).toEqual([cityTime, phase]);
    });
});

describe("the fixture builder", () => {

    const builderOnSeed8 = () => new CityBuilder(cityFromSeed(8, Level.easy, Speed.medium));

    it("lays only straight lines", () => {
        expect(() => builderOnSeed8().road(12, 12, 14, 14)).toThrow("A road line must be horizontal or vertical");
    });

    // A zone centred on the corner tile would hang off the map
    it("fails when a tool does", () => {
        expect(() => builderOnSeed8().residential(0, 0)).toThrow("The residential tool failed at (0, 0)");
    });

    it("needs auto-bulldoze on", () => {
        const baseTool = BaseTool as unknown as {getAutoBulldoze(): boolean, setAutoBulldoze(value: boolean): void};
        baseTool.setAutoBulldoze(false);

        try {
            expect(() => buildFixture(fixtures.town)).toThrow("Fixtures are built with auto-bulldoze on");
        } finally {
            baseTool.setAutoBulldoze(true);
        }
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

    it.each([
        [["--seed", "1"], "--steps is required"],
        [["--seed", "1", "--steps", "3.5"], "--steps takes a whole number, got 3.5"],
        [["--seed", "x", "--steps", "1"], "--seed takes a whole number, got x"],
        [["--seed", "1", "--steps", "1", "--speed", "paused"], "--speed is one of slow, medium, fast, got paused"],
        [["--seed", "1", "--steps", "1", "--colour", "red"], "Unknown option '--colour'"],
    ])("rejects %j", (args, message) => {
        expect(() => parseCommandLine(args)).toThrow(message);
    });
});
