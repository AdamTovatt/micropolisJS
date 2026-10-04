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
import { WebSocketCitySource } from "../../src/webSocketCitySource";
import { WorkerCitySource, WorkerPort } from "../../src/workerCitySource";
import { ManualTicker } from "./manualTicker";
import { memorySessionStore, signedInClient, startTestServer, TestServer } from "./testServer";

// A city source the contract tests drive, whatever runs the simulation behind it. run takes one turn of the source's
// loop, after moving its clock on by the milliseconds given, and resolves once every state message that turn produced
// has been delivered. close stops the source.
export interface SourceUnderTest {
    source: CitySource;
    run(milliseconds?: number): Promise<void>;
    close(): void;
}

// create's debug is whether the client is in debug mode. onServer is whether the city runs on the server, which steps a
// shared city whether or not a player sees it, has no client debug mode, and reports a failure in words alone.
export interface SourceFactory {
    name: string;
    onServer: boolean;
    create(debug?: boolean): Promise<SourceUnderTest>;
}

export const pageSource: SourceFactory = {
    name: "the in-page source",
    onServer: false,
    create: async (debug = false) => {
        const ticker = new ManualTicker();
        return {source: new PageCitySource(ticker, debug), run: async (milliseconds) => ticker.run(milliseconds),
                close: () => {}};
    },
};

// The Worker source, with the worker's side served over a channel in the same thread, as cityWorker.ts serves it in a
// Web Worker
export const workerSource: SourceFactory = {
    name: "the Worker source",
    onServer: false,
    create: async (debug = false) => {
        // Node types a port's onmessage with its own event, not the DOM's MessageEvent, though what it reads of it,
        // the data, is the same. A port takes error listeners, as the Worker does, and fires no error event.
        const {port1, port2} = new MessageChannel();
        const ticker = new ManualTicker();
        serveCity(port1 as unknown as Port, ticker);
        const source = new WorkerCitySource(port2 as unknown as WorkerPort, debug);
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

// The WebSocket source, against the real server (testServer.ts), which the suite starts once and every source shares,
// each with a connection of its own. They share one stored session, as a browser's tabs do, so the suite signs in once.
// No test loses its city on the server, so a lost city fails the test that lost it.
export class WebSocketSourceFactory implements SourceFactory {
    readonly name = "the WebSocket source";
    readonly onServer = true;

    private server: TestServer | null = null;
    private readonly sessions = memorySessionStore();

    async startServer(): Promise<void> {
        this.server = await startTestServer();
    }

    async stopServer(): Promise<void> {
        await this.server?.stop();
    }

    // The server has no client debug mode
    async create(): Promise<SourceUnderTest> {
        if (this.server === null) {
            throw new Error("The test server hasn't started");
        }

        const {client, environment} = await signedInClient(this.server.origin, this.sessions, "Tester");
        const source = new WebSocketCitySource(client, (error) => {
            throw error;
        });
        return {
            source,
            // The server takes in what the source sent before the turn, since one socket keeps the order. A turn before
            // any city has started takes nothing, as a host's loop doesn't turn before one.
            run: async (milliseconds = 0) => {
                try {
                    await source.turn(milliseconds);
                } catch (e) {
                    if (!(e instanceof Error && e.message === "No city has started")) {
                        throw e;
                    }
                }
            },
            close: () => environment.close(),
        };
    }
}
