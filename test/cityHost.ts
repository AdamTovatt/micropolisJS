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

import { CityHost } from "../src/cityHost";
import { stepsPerCityTime } from "../src/cityTimeModel";
import { LOCAL_PLAYER, SPEEDS, StateMessage } from "../src/protocol";
import { ManualTicker } from "./helpers/manualTicker";

// What the city host itself decides, beyond the contract every source keeps (test/citySource.ts): how it batches the
// state messages it publishes

// The steps of a cycle of the simulation's 16 phases, at the speed a new city runs at: one unit of city time
const CYCLE = stepsPerCityTime(SPEEDS.medium);

// A host on a new city, held, and every batch of messages it has published since, in order
function heldCity() {
    const batches: StateMessage[][] = [];
    const host = new CityHost((messages) => batches.push(messages), new ManualTicker());
    host.hold();
    host.start({name: "Town", seed: 2026, level: 0});
    batches.length = 0;

    return {host, batches};
}

const ofType = (batch: StateMessage[], type: StateMessage["type"]) => batch.filter((message) => message.type === type);

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

    // A turn of several cycles publishes once: what holds at the end of it, and each event in the order it came
    describe("publishing several cycles at once", () => {

        let whole: StateMessage[];
        let halves: StateMessage[][];
        beforeAll(() => {
            const once = heldCity();
            expect(once.host.advance(10 * CYCLE).error).toBeNull();
            whole = once.batches[0]!;

            const twice = heldCity();
            expect(twice.host.advance(5 * CYCLE).error).toBeNull();
            expect(twice.host.advance(5 * CYCLE).error).toBeNull();
            halves = twice.batches;
        });

        it("publishes the turn as one batch", () => {
            expect(halves).toHaveLength(2);
        });

        it.each(["status", "demand"] as const)("sends the latest %s alone, which replaces those before it", (type) => {
            expect(ofType(halves[1]!, type)).toHaveLength(1);

            expect(ofType(whole, type)).toEqual(ofType(halves[1]!, type));
        });

        it("announces each layer recomputed once, however many times it was", () => {
            const layers = (batch: StateMessage[]) => ofType(batch, "overlayUpdated")
                .map((message) => message.type === "overlayUpdated" && message.layer);
            const announced = layers(whole);

            expect(new Set(announced).size).toBe(announced.length);
            const inHalves = [...layers(halves[0]!), ...layers(halves[1]!)];
            expect([...announced].sort()).toEqual(inHalves.filter((layer, i) => inHalves.indexOf(layer) === i).sort());
        });
    });
});
