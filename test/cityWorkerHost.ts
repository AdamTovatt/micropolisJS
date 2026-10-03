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

import type { PageMessage, Port, WorkerMessage } from "../src/cityWorkerMessages";
import { raiseUnhandledRejections, serveCity } from "../src/cityWorkerHost";
import { ManualTicker } from "./helpers/manualTicker";

// The worker's side of the Worker source, over a port the test reads and writes by hand. The contract tests
// (citySource.ts) cover what it serves; these cover what goes wrong in serving it.

// A served city, whose port takes what the page sends, and posts with post
function served(post: (message: WorkerMessage) => void = () => {}) {
    const port: Port = {postMessage: (message) => post(message as WorkerMessage), onmessage: null};
    serveCity(port, new ManualTicker());
    return (message: PageMessage) => port.onmessage!({data: message} as MessageEvent);
}

// Every promise callback queued so far has run
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("serving a city to the page", () => {

    it("throws what goes wrong outside a call, for the worker to carry to the page", () => {
        const receive = served();

        expect(() => receive({type: "send", command: {type: "addFunds"}})).toThrow("No city has started");
    });

    it("fails a call whose answer it can't post, so that no call goes unanswered", async () => {
        const posted: WorkerMessage[] = [];
        const receive = served((message) => {
            if (message.type === "answer") {
                // As the browser's DOMException would be, were it of Jest's realm
                throw Object.assign(new Error("The answer could not be cloned"), {name: "DataCloneError"});
            }
            posted.push(message);
        });

        receive({type: "call", id: 7, call: {method: "ask", query: {type: "mapPreview", seed: 1}}});
        await settled();

        expect(posted).toEqual([{type: "failed", id: 7,
                                 error: {name: "DataCloneError", message: "The answer could not be cloned"}}]);
    });
});

describe("a promise rejected in the worker with no one to catch it", () => {

    // The listener the worker's scope calls with such a rejection
    function rejectionListener() {
        let listener: ((event: {reason: unknown}) => void) | null = null;
        raiseUnhandledRejections({addEventListener: (_type, added) => {
            listener = added;
        }});
        return listener!;
    }

    it("is thrown, for the worker's error event to carry to the page", () => {
        const error = new RangeError("out of range");

        expect(() => rejectionListener()({reason: error})).toThrow(error);
    });

    it("is thrown as an error when it rejected with something else", () => {
        expect(() => rejectionListener()({reason: "no reason"})).toThrow(new Error("no reason"));
    });
});
