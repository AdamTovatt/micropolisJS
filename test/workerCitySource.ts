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

import type { WorkerMessage } from "../src/cityWorkerMessages";
import { WorkerCitySource, WorkerPort } from "../src/workerCitySource";

// The page's side of the Worker source, over a port the test answers by hand. The contract tests (citySource.ts) cover
// what it delivers; these cover what goes wrong in a reply, an answer or the worker.

// A source, what the worker would send it, and the error events the worker would fire: with a message for an error
// thrown in it, and without for a script that failed to load
function workerSource() {
    const errorListeners: ((event: Event) => void)[] = [];
    const port: WorkerPort = {
        postMessage: () => {},
        onmessage: null,
        addEventListener: (_type, listener) => errorListeners.push(listener),
    };
    const source = new WorkerCitySource(port, false);
    const preventDefault = jest.fn();
    const fire = (fields: {message?: string}) =>
        errorListeners.forEach((listener) => listener({preventDefault, ...fields} as unknown as Event));

    return {
        source,
        receive: (message: WorkerMessage) => port.onmessage!({data: message} as MessageEvent),
        fire,
        preventDefault,
    };
}

describe("the Worker source's replies to a query", () => {

    // As the in-page source throws at the call, rather than leaving the throw in a promise no one holds
    it("throws what the reply throws as the answer arrives", () => {
        const {source, receive} = workerSource();
        source.ask({type: "tileReport", x: 1, y: 1}, () => {
            throw new Error("not the answer the reply asked for");
        });

        expect(() => receive({type: "answer", id: 0, value: {type: "rejected", reason: "no city has started"}}))
            .toThrow("not the answer the reply asked for");
    });

    it("throws the error a query failed with as the failure arrives", () => {
        const {source, receive} = workerSource();
        source.ask({type: "tileReport", x: 1, y: 1}, () => {});

        expect(() => receive({type: "failed", id: 0, error: {name: "TypeError", message: "no such query"}}))
            .toThrow(TypeError);
    });
});

describe("the Worker source's answers", () => {

    it("rejects a call with a plain error under the error's message when its name is not JavaScript's own", async () => {
        const {source, receive} = workerSource();
        const saved = source.save();

        receive({type: "failed", id: 0, error: {name: "DataCloneError", message: "could not be cloned"}});

        const error = await saved.catch((e: unknown) => e);
        expect(error).toEqual(new Error("could not be cloned"));
        expect((error as Error).name).toBe("Error");
    });

    it("throws on an answer to a call it never made", () => {
        const {receive} = workerSource();

        expect(() => receive({type: "answer", id: 3, value: null}))
            .toThrow("The city's worker answered call 3, which was never made or already answered");
    });

    it("throws on a second answer to a call", async () => {
        const {source, receive} = workerSource();
        const saved = source.save();
        receive({type: "answer", id: 0, value: "{}"});
        await saved;

        expect(() => receive({type: "answer", id: 0, value: "{}"}))
            .toThrow("The city's worker answered call 0, which was never made or already answered");
    });
});

describe("the Worker source when its worker fails", () => {

    it("raises what went wrong in the worker in the page, once, and carries on", async () => {
        const {source, receive, fire, preventDefault} = workerSource();
        const saved = source.save();

        expect(() => fire({message: "Uncaught Error: the loop broke"}))
            .toThrow("The city's worker failed: Uncaught Error: the loop broke");
        expect(preventDefault).toHaveBeenCalled();

        receive({type: "answer", id: 0, value: "{}"});
        expect(await saved).toBe("{}");
    });

    it("fails every call waiting on a worker whose script didn't load, and every call after", async () => {
        const {source, fire} = workerSource();
        const started = source.start({name: "Town", seed: 1, level: 0});
        let replied = false;
        source.ask({type: "mapPreview", seed: 1}, () => {
            replied = true;
        });

        expect(() => fire({})).toThrow("The city's worker failed: its script didn't load");

        await expect(started).rejects.toThrow("its script didn't load");
        expect(replied).toBe(false);
        await expect(source.save()).rejects.toThrow("its script didn't load");
        await expect(source.driver.cityTime()).rejects.toThrow("its script didn't load");
        expect(() => source.ask({type: "mapPreview", seed: 1}, () => {})).toThrow("its script didn't load");
    });
});
