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

import type { Port, WorkerMessage } from "../src/cityWorkerMessages";
import { WorkerCitySource } from "../src/workerCitySource";

// The page's side of the Worker source, over a port the test answers by hand. The contract tests (citySource.ts) cover
// what it delivers; these cover what goes wrong in a reply.

// A source, and what the worker would send it
function workerSource() {
    const port: Port = {postMessage: () => {}, onmessage: null};
    const source = new WorkerCitySource(port, false);
    return {source, receive: (message: WorkerMessage) => port.onmessage!({data: message} as MessageEvent)};
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
