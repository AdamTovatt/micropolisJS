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

import type { SessionStore } from "../../src/cityClient";
import type { CitySource } from "../../src/citySource";
import { WebSocketCitySource } from "../../src/webSocketCitySource";
import { memorySessionStore, signedInClient, startTestServer, TestServer } from "./testServer";

// A city source the contract tests drive. run takes one turn of the source's loop, after moving the city's clock on by
// the milliseconds given, and resolves once every state message that turn produced has been delivered. close stops the
// source. lost gives why the source lost its city each time it did.
export interface SourceUnderTest {
    source: CitySource;
    run(milliseconds?: number): Promise<void>;
    close(): void;
    lost(): Error[];
}

// The real server (testServer.ts), which a suite starts once, and which makes the WebSocket sources it tests, each with a
// connection of its own. They share one stored session, as a browser's tabs do, so the suite signs in once.
export interface SourceServer {
    create(): Promise<SourceUnderTest>;
    stop(): Promise<void>;
}

export async function startSourceServer(): Promise<SourceServer> {
    const server = await startTestServer("manual");
    const sessions = memorySessionStore();
    return {
        create: () => connectedSource(server, sessions),
        stop: () => server.stop(),
    };
}

async function connectedSource(server: TestServer, sessions: SessionStore): Promise<SourceUnderTest> {
    const {client, environment} = await signedInClient(server.origin, sessions, "Tester");
    const lost: Error[] = [];
    const source = new WebSocketCitySource(client, (error) => lost.push(error));
    return {
        source,
        // The server takes in what the source sent before the turn, since one socket keeps the order. A turn before any
        // city has started takes nothing, as a host's loop doesn't turn before one.
        run: async (milliseconds = 0) => {
            if (source.city !== null) {
                await source.turn(milliseconds);
            }
        },
        close: () => environment.close(),
        lost: () => lost,
    };
}
