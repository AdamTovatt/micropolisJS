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

import { MessageChannel } from "worker_threads";
import type { CitySource } from "../../src/citySource";
import type { Port } from "../../src/cityWorkerMessages";
import { serveCity } from "../../src/cityWorkerHost";
import { PageCitySource } from "../../src/pageCitySource";
import { WorkerCitySource } from "../../src/workerCitySource";
import { ManualTicker } from "./manualTicker";

// A city source the contract tests drive, whatever runs the simulation behind it. run takes one turn of the source's
// loop, after moving its clock on by the milliseconds given, and resolves once every state message that turn produced
// has been delivered. close stops the source.
export interface SourceUnderTest {
    source: CitySource;
    run(milliseconds?: number): Promise<void>;
    close(): void;
}

// create's debug is whether the client is in debug mode
export interface SourceFactory {
    name: string;
    create(debug?: boolean): SourceUnderTest;
}

export const pageSource: SourceFactory = {
    name: "the in-page source",
    create: (debug = false) => {
        const ticker = new ManualTicker();
        return {source: new PageCitySource(ticker, debug), run: async (milliseconds) => ticker.run(milliseconds),
                close: () => {}};
    },
};

// The Worker source, with the worker's side served over a channel in the same thread, as cityWorker.ts serves it in a
// Web Worker
export const workerSource: SourceFactory = {
    name: "the Worker source",
    create: (debug = false) => {
        // Node types a port's onmessage with its own event, not the DOM's MessageEvent, though what it reads of it,
        // the data, is the same
        const {port1, port2} = new MessageChannel();
        const ticker = new ManualTicker();
        serveCity(port1 as unknown as Port, ticker);
        const source = new WorkerCitySource(port2 as unknown as Port, debug);
        // Each end reads what came before a call before it answers the call, so once a call is answered, the worker
        // has had everything the page sent before it, and the page everything the worker sent. Before a city starts,
        // the call fails, and that is its answer.
        const roundTrip = () => source.driver.cityTime().then(() => {}, () => {});

        return {
            source,
            // A worker takes in the messages that came before its next turn, as it would in the browser
            run: async (milliseconds) => {
                await roundTrip();
                ticker.run(milliseconds);
                await roundTrip();
            },
            close: () => {
                port1.close();
                port2.close();
            },
        };
    },
};
