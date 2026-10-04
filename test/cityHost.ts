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

import { fixtureSave } from "../headless/runner";
import { CityHost } from "../src/cityHost";
import { stepsPerCityTime } from "../src/cityTimeModel";
import * as Messages from "../src/messages";
import { LOCAL_PLAYER, OVERLAY_LAYERS, SPEEDS, StateMessage, StateMessageType } from "../src/protocol";
import { SaveFormat } from "../src/savedGame";
import { ManualTicker } from "./helpers/manualTicker";

// What the city host itself decides, beyond the contract every source keeps (test/citySource.ts): how it batches the
// state messages it publishes

// The steps of a cycle of the simulation's 16 phases, at the speed a new city runs at: one unit of city time
const CYCLE = stepsPerCityTime(SPEEDS.medium);
// A month's steps, four cycles, and a stretch of steps that ends at a different phase each time
const MONTH = 4 * CYCLE;
const CHUNK = 7;

// A host on a new city, held, and every batch of messages it has published since, in order
function heldCity() {
    const batches: StateMessage[][] = [];
    const host = new CityHost((messages) => batches.push(messages), new ManualTicker());
    host.hold();
    host.start({name: "Town", seed: 2026, level: 0});
    batches.length = 0;

    return {host, batches};
}

function ofType<T extends StateMessageType>(batch: StateMessage[], type: T) {
    return batch.filter((message): message is Extract<StateMessage, {type: T}> => message.type === type);
}

describe("a city host", () => {

    describe("before a city has started", () => {

        it("takes no commands, and has no driver to work", () => {
            const host = new CityHost(() => {}, new ManualTicker());

            expect(() => host.send(LOCAL_PLAYER, {type: "addFunds"})).toThrow("No city has started");
            expect(() => host.flush()).toThrow("No city has started");
            expect(() => host.cityTime()).toThrow("No city has started");
            expect(host.advance(1)).toEqual({steps: 0, budgetReviewDue: false, error: "No city has started"});
        });
    });

    it("sends the sprites, the date, the population and the records only when they changed", () => {
        const {host, batches} = heldCity();
        host.send(LOCAL_PLAYER, {type: "setAutoBudget", on: false});

        host.flush();

        expect(batches).toHaveLength(1);
        expect(batches[0]!.map((message) => message.type)).toEqual(["settings", "commandResult"]);
    });

    // A worker's timers run at full rate in a hidden tab, so a loop with nothing to do would spin
    describe("its loop", () => {

        // A host on a new city, running, with the first turn of its loop taken
        function runningCity() {
            const ticker = new ManualTicker();
            const host = new CityHost(() => {}, ticker);
            host.start({name: "Town", seed: 2026, level: 0});
            ticker.run();
            return {host, ticker};
        }

        it("turns again and again while the city steps", () => {
            const {ticker} = runningCity();

            ticker.run(1000);

            expect(ticker.hasCallback()).toBe(true);
        });

        it("waits while the city is paused, until a command comes", () => {
            const {host, ticker} = runningCity();
            host.send(LOCAL_PLAYER, {type: "setSpeed", speed: SPEEDS.paused});
            ticker.run();
            expect(ticker.hasCallback()).toBe(false);

            host.send(LOCAL_PLAYER, {type: "setSpeed", speed: SPEEDS.medium});
            expect(ticker.hasCallback()).toBe(true);
            ticker.run();

            expect(ticker.hasCallback()).toBe(true);
        });

        it("waits while the player can't see the city, until they can", () => {
            const {host, ticker} = runningCity();
            host.setViewerVisible(false);
            ticker.run();
            expect(ticker.hasCallback()).toBe(false);

            host.setViewerVisible(true);

            expect(ticker.hasCallback()).toBe(true);
        });

        it("waits while the driver is held, until it is released", () => {
            const {host, ticker} = runningCity();
            host.hold();
            ticker.run();
            expect(ticker.hasCallback()).toBe(false);

            host.release();

            expect(ticker.hasCallback()).toBe(true);
        });

        it("takes one turn at a time, however often it is woken", () => {
            const {host, ticker} = runningCity();

            host.setViewerVisible(true);
            host.send(LOCAL_PLAYER, {type: "addFunds"});
            const turns = jest.spyOn(ticker, "later");
            ticker.run();

            expect(turns).toHaveBeenCalledTimes(1);
        });
    });

    // The census is cleared at the start of each cycle and counted back up through it, so a population read from it
    // between growth checks would be part counted
    it("sends the population the last growth check found, as it changes", () => {
        const batches: StateMessage[][] = [];
        const host = new CityHost((messages) => batches.push(messages), new ManualTicker());
        host.hold();
        host.start({save: SaveFormat.serialise({...fixtureSave("suburb"), name: "Suburb"})});
        const sent = () => batches.flatMap((batch) => batch.flatMap((message) =>
            message.type === "population" ? [message.population] : []));

        for (let taken = 0; taken < 6 * MONTH; taken += CHUNK) {
            expect(host.advance(CHUNK).error).toBeNull();

            expect(sent()[sent().length - 1]).toBe(JSON.parse(host.save()).simulation.cityPopLast);
        }
        expect(new Set(sent()).size).toBeGreaterThan(2);
        expect(sent().every((population, i, all) => i === 0 || population !== all[i - 1])).toBe(true);
    });

    // The crashed plane's explosion is reported on the crash's tile or the one east of it, one row north, without a
    // place for the monster TV to show
    it("sends the news of an explosion with where it happened", () => {
        const {host, batches} = heldCity();
        host.send(LOCAL_PLAYER, {type: "triggerDisaster", kind: "crash"});

        expect(host.advance(2).error).toBeNull();

        const news = batches.flatMap((batch) => ofType(batch, "news"));
        expect(news.map((message) => message.subject)).toEqual([Messages.PLANE_CRASHED, Messages.EXPLOSION_REPORTED]);
        const crash = news[0]!.data!;
        const explosion = news[1]!.data!;
        expect(explosion).toEqual({x: expect.any(Number), y: expect.any(Number)});
        expect([crash.x, crash.x + 1]).toContain(explosion.x);
        expect(explosion.y).toBe(crash.y - 1);
    });

    // A turn of several cycles publishes once: what holds at the end of it, and each event in the order it came
    describe("publishing several cycles at once", () => {

        let onceBatches: StateMessage[][];
        let whole: StateMessage[];
        let halves: StateMessage[][];
        beforeAll(() => {
            const once = heldCity();
            expect(once.host.advance(10 * CYCLE).error).toBeNull();
            onceBatches = once.batches;
            whole = once.batches[0]!;

            const twice = heldCity();
            expect(twice.host.advance(5 * CYCLE).error).toBeNull();
            expect(twice.host.advance(5 * CYCLE).error).toBeNull();
            halves = twice.batches;
        });

        it("publishes the turn as one batch", () => {
            expect(onceBatches).toHaveLength(1);
            expect(halves).toHaveLength(2);
        });

        it.each(["status", "demand"] as const)("sends the latest %s alone, which replaces those before it", (type) => {
            expect(ofType(halves[1]!, type)).toHaveLength(1);

            expect(ofType(whole, type)).toEqual(ofType(halves[1]!, type));
        });

        it("announces each layer recomputed once, however many times it was", () => {
            const layers = (batch: StateMessage[]) => ofType(batch, "overlayUpdated").map((message) => message.layer);
            const announced = layers(whole);

            // Ten cycles run every phase that recomputes a layer, the slowest included
            expect([...announced].sort()).toEqual([...OVERLAY_LAYERS].sort());
            const inHalves = [...layers(halves[0]!), ...layers(halves[1]!)];
            expect([...announced].sort()).toEqual(inHalves.filter((layer, i) => inHalves.indexOf(layer) === i).sort());
        });
    });
});
