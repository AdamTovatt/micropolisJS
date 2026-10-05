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

import type { CityStart } from "../src/citySource";
import { CityState } from "../src/cityState";
import { CITY_ID, Query, QueryAnswer, SPEEDS, StateMessage } from "../src/protocol";
import { SourceServer, SourceUnderTest, startSourceServer } from "./helpers/citySources";
import { STEPS_PER_CITY_TIME } from "./helpers/cityTimes";
import { parseLog } from "./helpers/commandLog";
import { answerTo } from "./helpers/queryAnswers";
import { gameSaveHash } from "./helpers/stateHash";
import { serverTestsEnabled, START_SERVER_TIMEOUT_MS } from "./helpers/testServer";

// The contract the city source keeps, against the real server, which only CI's server job tests against
// (testServer.ts). The cities are new ones, and saves of new ones.

const SEED = 2026;
// The milliseconds a number of steps takes in real time, at the 60 steps a second the server's cities take
const millisecondsFor = (steps: number) => steps * 1000 / 60;

(serverTestsEnabled() ? describe : describe.skip)("the WebSocket source", () => {
    let server: SourceServer;
    beforeAll(async () => {
        server = await startSourceServer();
    }, START_SERVER_TIMEOUT_MS);
    afterAll(() => server?.stop());

    let tested: SourceUnderTest;
    let state: CityState;
    let messages: StateMessage[];

    beforeEach(async () => {
        tested = await server.create();
        state = new CityState(tested.source);
        messages = [];
        tested.source.subscribe((message) => messages.push(message));
    });

    // A source that lost its city fails the test that lost it: no test loses one on purpose
    afterEach(() => {
        tested.close();
        expect(tested.lost()).toEqual([]);
    });

    function ask(query: Query): Promise<QueryAnswer> {
        return answerTo(tested.source, query);
    }

    // The raw values of the city's tiles, as its save holds them
    async function savedTiles(): Promise<number[]> {
        const save = JSON.parse(await tested.source.driver.savedGame()) as {map: {tiles: number[]}};
        return save.map.tiles;
    }

    function clientTiles(): number[] {
        const map = state.map;
        return map.getTileValuesForPainting(0, 0, map.width, map.height, []);
    }

    // The save of a city started on a source of its own
    async function savedElsewhere(start: CityStart): Promise<string> {
        const other = await server.create();
        try {
            await other.source.start(start);
            return await other.source.driver.savedGame();
        } finally {
            other.close();
        }
    }

    // A city as a start resolves with it: its id, which another player could join it by
    function startedCity(name: string, seed: number) {
        return {name, seed, city: expect.stringMatching(CITY_ID)};
    }

    // Starts a new city on the seed's map, and takes the first turn of the source's loop, which starts its clock
    async function startNewCity(name = "Town") {
        const started = await tested.source.start({name, seed: SEED, level: 0});
        await tested.run();
        return started;
    }

    describe("before a city has started", () => {

        // A new city starts on the map the preview shows, as "starting a city" checks
        it("answers a map preview with the seed's map, a tile id and flags for each of its tiles", async () => {
            const answer = await ask({type: "mapPreview", seed: SEED});

            expect(answer).toMatchObject({type: "mapPreview", seed: SEED, width: 120, height: 100});
            expect((answer as {tiles: number[]}).tiles).toHaveLength(120 * 100);
        });

        it("answers a map preview of another seed with another map", async () => {
            const preview = await ask({type: "mapPreview", seed: SEED}) as {tiles: number[]};
            const another = await ask({type: "mapPreview", seed: SEED + 1}) as {tiles: number[]};

            expect(another.tiles).not.toEqual(preview.tiles);
        });

        it.each([-1, 0.5, 2 ** 32])("rejects a map preview of a seed that isn't a uint32, %d", async (seed) => {
            expect(await ask({type: "mapPreview", seed})).toEqual({type: "rejected", reason: "the seed is a uint32"});
        });

        it("answers a map preview of the largest seed", async () => {
            expect(await ask({type: "mapPreview", seed: 0xffffffff})).toMatchObject({type: "mapPreview", seed: 0xffffffff});
        });

        it("rejects any query about a city", async () => {
            expect(await ask({type: "tileReport", x: 1, y: 1}))
                .toEqual({type: "rejected", reason: "no city has started"});
        });

        it("refuses to save, give its save or give its log", async () => {
            await expect(tested.source.save()).rejects.toThrow("No city has started");
            await expect(tested.source.download()).rejects.toThrow("No city has started");
            await expect(tested.source.driver.savedGame()).rejects.toThrow("No city has started");
            await expect(tested.source.commandLog()).rejects.toThrow("No city has started");
        });

        it("sends nothing", async () => {
            await tested.run(1000);

            expect(messages).toEqual([]);
        });
    });

    describe("starting a city", () => {

        it("delivers the whole map, the date, the population and the records before the start resolves", async () => {
            const started = await tested.source.start({name: "Town", seed: SEED, level: 0});

            expect(started).toEqual(startedCity("Town", SEED));
            expect(messages.map(({type}) => type)).toEqual(["map", "sprites", "date", "population", "evaluation",
                                                            "budget", "settings"]);
            expect(clientTiles()).toEqual(await savedTiles());
        });

        it("starts on the map the preview showed", async () => {
            const preview = await ask({type: "mapPreview", seed: SEED}) as {tiles: number[]};
            await tested.source.start({name: "Town", seed: SEED, level: 0});

            expect(clientTiles()).toEqual(preview.tiles);
        });

        it("starts a saved game as it was saved, under the name it was saved under", async () => {
            await startNewCity("Saved");
            tested.source.send({type: "tool", tool: "road", path: [{x: 30, y: 30}], autoBulldoze: true});
            await tested.run(millisecondsFor(100));
            const text = await tested.source.driver.savedGame();

            const other = await server.create();
            try {
                expect(await other.source.start({save: text})).toEqual(startedCity("Saved", SEED));
                expect(await other.source.driver.savedGame()).toBe(text);
            } finally {
                other.close();
            }
        });

        it("refuses a save that won't load, and keeps the city it had", async () => {
            await startNewCity();
            const before = await tested.source.driver.savedGame();
            const saved = () => JSON.parse(before) as Record<string, unknown>;

            // A failure on the server reaches the page in the C# rules' words
            await expect(tested.source.start({save: "not a save"})).rejects.toThrow(/^The save's state is not JSON/);
            const nameless = saved();
            delete nameless.name;
            await expect(tested.source.start({save: JSON.stringify(nameless)})).rejects.toThrow("The save's name must be a string.");
            const mapless = saved();
            delete mapless.map;
            await expect(tested.source.start({save: JSON.stringify(mapless)})).rejects.toThrow("The save's map is missing.");

            expect(await tested.source.driver.savedGame()).toBe(before);
        });

        it("replaces the city it had, the client's copy of it included", async () => {
            const driver = tested.source.driver;
            await driver.hold();
            await startNewCity();
            tested.source.send({type: "tool", tool: "road", path: [{x: 30, y: 30}], autoBulldoze: true});
            await driver.advance(10 * STEPS_PER_CITY_TIME);
            const other = await savedElsewhere({name: "Other", seed: SEED + 1, level: 2});

            messages.length = 0;
            expect(await tested.source.start({save: other})).toEqual(startedCity("Other", SEED + 1));

            // The whole map again, and every record, though some are as the city before last sent them
            expect(messages.map(({type}) => type)).toEqual(["map", "sprites", "date", "population", "evaluation",
                                                            "budget", "settings"]);
            expect(clientTiles()).toEqual(await savedTiles());
            expect(state.latest("commandResult")).toBeNull();

            // A held driver stays held: the new city takes only the steps asked for
            await tested.run(millisecondsFor(10 * STEPS_PER_CITY_TIME));
            expect(await driver.cityTime()).toBe(0);
        });
    });

    describe("a running city", () => {

        it("applies the commands sent on its next turn, paused or not, and sends what came of them", async () => {
            await startNewCity();
            tested.source.send({type: "setSpeed", speed: SPEEDS.paused});
            tested.source.send({type: "tool", tool: "road", path: [{x: 30, y: 30}, {x: 31, y: 30}],
                                autoBulldoze: true});
            await tested.run();

            const results = messages.filter((message) => message.type === "commandResult");
            expect(results.map((message) => message.type === "commandResult" && message.result.command))
                .toEqual([{type: "setSpeed", speed: SPEEDS.paused},
                          {type: "tool", tool: "road", path: [{x: 30, y: 30}, {x: 31, y: 30}], autoBulldoze: true}]);
            expect(state.current("settings").speed).toBe(SPEEDS.paused);
            expect(clientTiles()).toEqual(await savedTiles());
        });

        it("steps itself in real time, at its own speed, and keeps the client's copy of the map up to date", async () => {
            await startNewCity();
            tested.source.send({type: "tool", tool: "residential", path: [{x: 30, y: 30}], autoBulldoze: true});

            // A turn takes at most a second's steps
            for (let turn = 0; turn < 10; turn++) {
                await tested.run(millisecondsFor(STEPS_PER_CITY_TIME));
            }

            expect(await tested.source.driver.cityTime()).toBe(10);
            expect(clientTiles()).toEqual(await savedTiles());
        });

        it("doesn't step while paused", async () => {
            await startNewCity();
            tested.source.send({type: "setSpeed", speed: SPEEDS.paused});

            await tested.run(millisecondsFor(10 * STEPS_PER_CITY_TIME));

            expect(await tested.source.driver.cityTime()).toBe(0);
        });

        it("sends nothing on a turn that changes nothing", async () => {
            await startNewCity();
            tested.source.send({type: "setSpeed", speed: SPEEDS.paused});
            await tested.run();
            const sent = messages.length;

            await tested.run(1000);

            expect(messages.length).toBe(sent);
        });

        it("answers queries about the city", async () => {
            await startNewCity();

            expect(await ask({type: "tileReport", x: 30, y: 30})).toMatchObject({type: "tileReport", x: 30, y: 30});
        });

        // The C# rules replay a log the server keeps, as GoldenPlaythroughTests does the playthrough's
        it("keeps a log of the session that ends at a checkpoint of the city's state", async () => {
            await startNewCity();
            tested.source.send({type: "tool", tool: "road", path: [{x: 30, y: 30}, {x: 31, y: 30}],
                                autoBulldoze: true});
            await tested.run(millisecondsFor(100));

            const recorded = await tested.source.commandLog();

            expect(Object.keys(recorded).sort()).toEqual(["log", "step"]);
            expect(recorded.step).toBeGreaterThan(0);
            const log = parseLog(recorded.log);
            expect(log.entries).toHaveLength(1);
            expect(log.checkpoints[log.checkpoints.length - 1]).toEqual({
                step: recorded.step, hash: gameSaveHash(JSON.parse(await tested.source.driver.savedGame())),
            });
        });
    });

    describe("its driver", () => {

        it("holds the city, and takes exactly the steps asked", async () => {
            const driver = tested.source.driver;
            await driver.hold();
            await startNewCity();
            await tested.run(millisecondsFor(10 * STEPS_PER_CITY_TIME));
            expect(await driver.cityTime()).toBe(0);

            expect(await driver.advance(2 * STEPS_PER_CITY_TIME))
                .toEqual({steps: 2 * STEPS_PER_CITY_TIME, budgetReviewDue: false, error: null});
            expect(await driver.cityTime()).toBe(2);
        });

        it("leaves the commands to the runner while held, and applies them on flush", async () => {
            const driver = tested.source.driver;
            await driver.hold();
            await startNewCity();
            tested.source.send({type: "setAutoBudget", on: false});
            await tested.run();
            expect(state.current("settings").autoBudget).toBe(true);

            await driver.flush();

            expect(state.current("settings").autoBudget).toBe(false);
        });

        it("sends the state an advance changed before the advance resolves", async () => {
            const driver = tested.source.driver;
            await driver.hold();
            await startNewCity();

            await driver.advance(10 * STEPS_PER_CITY_TIME);

            expect(state.current("date")).toMatchObject({month: 2});
            expect(clientTiles()).toEqual(await savedTiles());
        });

        it("says whether it is held, and once released leaves the city to apply commands and step on its own", async () => {
            const driver = tested.source.driver;
            expect(driver.isHeld()).toBe(false);
            await driver.hold();
            expect(driver.isHeld()).toBe(true);
            await startNewCity();
            tested.source.send({type: "setAutoBudget", on: false});
            await tested.run(millisecondsFor(STEPS_PER_CITY_TIME));
            expect(state.current("settings").autoBudget).toBe(true);
            expect(await driver.cityTime()).toBe(0);

            // The turn after the release starts the clock again, without catching up on the time it was held
            await driver.release();
            expect(driver.isHeld()).toBe(false);
            await tested.run(millisecondsFor(10 * STEPS_PER_CITY_TIME));
            await tested.run(millisecondsFor(STEPS_PER_CITY_TIME));

            expect(state.current("settings").autoBudget).toBe(false);
            expect(await driver.cityTime()).toBe(1);
        });

        it("reports why an advance failed", async () => {
            const driver = tested.source.driver;
            await startNewCity();

            expect(await driver.advance(1)).toEqual({steps: 0, budgetReviewDue: false,
                                                     error: "Advance needs the driver held, or the driver's steps " +
                                                            "would land at times of its own"});
        });

        // The pause applied before the check that the city steps: the commands may be the Pause button's
        it.each([
            ["paused", false],
            ["paused by a command the advance applies", true],
        ])("refuses to advance a city %s, and takes no step", async (_, pauseUnapplied) => {
            const driver = tested.source.driver;
            await driver.hold();
            await startNewCity();
            tested.source.send({type: "setSpeed", speed: SPEEDS.paused});
            if (!pauseUnapplied) {
                await driver.flush();
            }

            expect(await driver.advance(1)).toEqual({steps: 0, budgetReviewDue: false,
                                                     error: "The city is not stepping: it is paused"});
            expect(await driver.cityTime()).toBe(0);
        });
    });

    it("gives a save whose text is the save format's", async () => {
        await startNewCity();

        expect(JSON.parse(await tested.source.driver.savedGame()))
            .toMatchObject({name: "Town", version: expect.any(Number), map: {width: 120, height: 100}});
    });

    // The server's store keeps the city, as Micropolis.Server.Tests checks
    it("saves the city in the server's store", async () => {
        await startNewCity();
        tested.source.send({type: "tool", tool: "road", path: [{x: 30, y: 30}], autoBulldoze: true});
        await tested.run(millisecondsFor(100));

        await expect(tested.source.save()).resolves.toBeUndefined();
    });

    // A file the player keeps, which Load starts again as a new city
    it("gives the city's save to download, as the runner reads it", async () => {
        await startNewCity();
        tested.source.send({type: "tool", tool: "road", path: [{x: 30, y: 30}], autoBulldoze: true});
        await tested.run(millisecondsFor(100));

        expect(await tested.source.download()).toBe(await tested.source.driver.savedGame());
    });
});
