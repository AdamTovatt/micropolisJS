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

import { cityFromSave, cityFromSeed, Level, Speed } from "../headless/city";
import { parseCommandLine } from "../headless/commandLine";
import { buildFixture, CityBuilder } from "../headless/fixtures/builder";
import { BaseTool } from "../src/baseTool.js";
import { fixtureNames, fixtures, fixtureSave } from "../headless/fixtures/index";
import { advance, startCity, startFromSave, summarise } from "../headless/runner";
import { canonicalJson } from "../src/canonicalJson";
import { savedState, stateHash } from "../src/stateHash";

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
        expect(startCity({fixture: "town", speed: "fast"})._speed).toBe(Speed.fast);
    });

    describe("given a fixture saved paused", () => {
        const pausedSave = () => ({...fixtureSave("town"), _speed: Speed.paused});

        it("fails at once without a speed", () => {
            expect(() => startFromSave(pausedSave(), {})).toThrow("The city is saved paused: give a speed to run it");
        });

        it("runs at the speed it is given", () => {
            expect(startFromSave(pausedSave(), {speed: "slow"})._speed).toBe(Speed.slow);
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
