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

import { replay } from "../headless/runner";
import type { CityStart } from "../src/citySource";
import { stepsPerCityTime } from "../src/cityTimeModel";
import { CityState } from "../src/cityState";
import { CommandLog } from "../src/commandLog";
import { Config } from "../src/config.js";
import { MapGenerator } from "../src/mapGenerator.js";
import { Query, QueryAnswer, SPEEDS, StateMessage } from "../src/protocol";
import { Random } from "../src/random";
import { SaveFormat } from "../src/savedGame";
import { STEPS_PER_SECOND } from "../src/stepDriver";
import { BIT_MASK } from "../src/tileFlags";
import { pageSource, SourceFactory, SourceUnderTest, WebSocketSourceFactory, workerSource } from "./helpers/citySources";
import { serverTestsEnabled, START_SERVER_TIMEOUT_MS } from "./helpers/testServer";

// The contract every city source keeps, whatever runs the simulation behind it. The cities are new ones, and saves of
// new ones.

const SEED = 2026;
const STEPS_PER_CITY_TIME = stepsPerCityTime(SPEEDS.medium);
// The milliseconds a number of steps takes in real time
const millisecondsFor = (steps: number) => steps * 1000 / STEPS_PER_SECOND;

describe.each([pageSource, workerSource])("$name", (factory) => contract(factory));

// The WebSocket source runs against the real server, which only CI's server job tests against (testServer.ts)
const webSocketSource = new WebSocketSourceFactory();
(serverTestsEnabled() ? describe : describe.skip)(webSocketSource.name, () => {
    beforeAll(() => webSocketSource.startServer(), START_SERVER_TIMEOUT_MS);
    afterAll(() => webSocketSource.stopServer());

    contract(webSocketSource);
});

function contract(factory: SourceFactory): void {

    let tested: SourceUnderTest;
    let state: CityState;
    let messages: StateMessage[];

    beforeEach(async () => {
        tested = await factory.create();
        state = new CityState(tested.source);
        messages = [];
        tested.source.subscribe((message) => messages.push(message));
    });

    afterEach(() => tested.close());

    function ask(query: Query): Promise<QueryAnswer> {
        return new Promise((resolve) => tested.source.ask(query, resolve));
    }

    // The raw values of the city's tiles, as its save holds them
    async function savedTiles(): Promise<number[]> {
        const save = JSON.parse(await tested.source.save()) as {map: {tiles: number[]}};
        return save.map.tiles;
    }

    function clientTiles(): number[] {
        const map = state.map;
        return map.getTileValuesForPainting(0, 0, map.width, map.height, []);
    }

    // The save of a city started on a source of its own
    async function savedElsewhere(start: CityStart): Promise<string> {
        const other = await factory.create();
        try {
            await other.source.start(start);
            return await other.source.save();
        } finally {
            other.close();
        }
    }

    // A city as a start resolves with it: only a city on the server has an id another player could join it by
    function startedCity(name: string, seed: number) {
        return {name, seed, city: factory.onServer ? expect.stringMatching(/^[0-9a-f]{32}$/) : null};
    }

    // Starts a new city on the seed's map, and takes the first turn of the source's loop, which starts its clock
    async function startNewCity(name = "Town") {
        const started = await tested.source.start({name, seed: SEED, level: 0});
        await tested.run();
        return started;
    }

    describe("before a city has started", () => {

        it("answers a map preview with the map a new city on the seed starts on", async () => {
            const answer = await ask({type: "mapPreview", seed: SEED});
            const map = MapGenerator(Random.mapStream(SEED));

            expect(answer).toMatchObject({type: "mapPreview", seed: SEED, width: map.width, height: map.height});
            const tiles = (answer as {tiles: number[]}).tiles;
            expect(tiles[map.width * 10 + 20] & BIT_MASK).toBe(map.getTileValue(20, 10));
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

        it("refuses to save or give its log", async () => {
            await expect(tested.source.save()).rejects.toThrow("No city has started");
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
            const text = await tested.source.save();

            const other = await factory.create();
            try {
                expect(await other.source.start({save: text})).toEqual(startedCity("Saved", SEED));
                expect(await other.source.save()).toBe(text);
            } finally {
                other.close();
            }
        });

        it("refuses a save that won't load, and keeps the city it had", async () => {
            await startNewCity();
            const before = await tested.source.save();
            const saved = () => JSON.parse(before) as Record<string, unknown>;

            // A failure on the server reaches the page in the C# rules' words
            await expect(tested.source.start({save: "not a save"}))
                .rejects.toThrow(factory.onServer ? /^The save's state is not JSON/ : SyntaxError);
            const nameless = saved();
            delete nameless.name;
            await expect(tested.source.start({save: JSON.stringify(nameless)})).rejects.toThrow("The save's name must be a string.");
            const mapless = saved();
            delete mapless.map;
            await expect(tested.source.start({save: JSON.stringify(mapless)}))
                .rejects.toThrow(factory.onServer ? "The save's map is missing." : TypeError);

            expect(await tested.source.save()).toBe(before);
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

        if (factory.onServer) {
            it("steps while the player can't see it: one player's view doesn't hold a shared city", async () => {
                await startNewCity();
                tested.source.setViewerVisible(false);

                await tested.run(millisecondsFor(STEPS_PER_CITY_TIME));

                expect(await tested.source.driver.cityTime()).toBe(1);
            });
        } else {
            it("doesn't step while the player can't see it, and resumes without catching up", async () => {
                await startNewCity();
                tested.source.setViewerVisible(false);

                await tested.run(millisecondsFor(10 * STEPS_PER_CITY_TIME));
                expect(await tested.source.driver.cityTime()).toBe(0);

                tested.source.setViewerVisible(true);
                await tested.run(millisecondsFor(10 * STEPS_PER_CITY_TIME));
                await tested.run(millisecondsFor(STEPS_PER_CITY_TIME));
                expect(await tested.source.driver.cityTime()).toBe(1);
            });
        }

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

        it("keeps a log of the session that replays to the city's state", async () => {
            await startNewCity();
            tested.source.send({type: "tool", tool: "road", path: [{x: 30, y: 30}, {x: 31, y: 30}],
                                autoBulldoze: true});
            await tested.run(millisecondsFor(100));

            const recorded = await tested.source.commandLog();

            expect(recorded.unhashed).toBeNull();
            expect(recorded.step).toBeGreaterThan(0);
            const log = recorded.log as CommandLog;
            expect(log.entries).toHaveLength(1);
            expect(await replay(log).verified).toBe(log.checkpoints.length);
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
    });

    // The simulation's debug mode is a module both sides share under Jest, so the test puts it back. The server's
    // simulation has no debug mode of the client's.
    if (!factory.onServer) {
        it("passes the client's debug mode on to the simulation", async () => {
            const debugging = await factory.create(true);
            try {
                await debugging.run();
                expect(Config.debug).toBe(true);
            } finally {
                debugging.close();
                Config.debug = false;
            }
        });
    }

    it("saves a game whose text is the save format's", async () => {
        await startNewCity();

        expect(SaveFormat.parse(await tested.source.save())).toMatchObject({name: "Town"});
    });
}
