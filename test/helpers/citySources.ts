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

import type { CitySource } from "../../src/citySource";
import { PageCitySource } from "../../src/pageCitySource";
import { WebSocketCitySource } from "../../src/webSocketCitySource";
import { ManualTicker } from "./manualTicker";
import { memorySessionStore, signedInClient, startTestServer, TestServer } from "./testServer";

// A city source the contract tests drive, whatever runs the simulation behind it. run takes one turn of the source's
// loop, after moving its clock on by the milliseconds given, and resolves once every state message that turn produced
// has been delivered. close stops the source. lost gives why the source lost its city each time it did, which only a
// city on a server can be.
export interface SourceUnderTest {
    source: CitySource;
    run(milliseconds?: number): Promise<void>;
    close(): void;
    lost(): Error[];
}

// onServer is whether the city runs on the server, which steps a shared city whether or not a player sees it, and
// reports a failure in words alone
export interface SourceFactory {
    name: string;
    onServer: boolean;
    create(): Promise<SourceUnderTest>;
}

export const pageSource: SourceFactory = {
    name: "the in-page source",
    onServer: false,
    create: async () => {
        const ticker = new ManualTicker();
        return {source: new PageCitySource(ticker), run: async (milliseconds) => ticker.run(milliseconds),
                close: () => {}, lost: () => []};
    },
};

// The WebSocket source, against the real server (testServer.ts), which the suite starts once and every source shares,
// each with a connection of its own. They share one stored session, as a browser's tabs do, so the suite signs in once.
export class WebSocketSourceFactory implements SourceFactory {
    readonly name = "the WebSocket source";
    readonly onServer = true;

    private server: TestServer | null = null;
    private readonly sessions = memorySessionStore();

    async startServer(): Promise<void> {
        this.server = await startTestServer("manual");
    }

    async stopServer(): Promise<void> {
        await this.server?.stop();
    }

    async create(): Promise<SourceUnderTest> {
        if (this.server === null) {
            throw new Error("The test server hasn't started");
        }

        const {client, environment} = await signedInClient(this.server.origin, this.sessions, "Tester");
        const lost: Error[] = [];
        const source = new WebSocketCitySource(client, (error) => lost.push(error));
        return {
            source,
            // The server takes in what the source sent before the turn, since one socket keeps the order. A turn before
            // any city has started takes nothing, as a host's loop doesn't turn before one.
            run: async (milliseconds = 0) => {
                if (source.city !== null) {
                    await source.turn(milliseconds);
                }
            },
            close: () => environment.close(),
            lost: () => lost,
        };
    }
}
