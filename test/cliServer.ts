/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

import { CityConnection } from "../cli/cityConnection";
import { LASTROAD, ROADBASE } from "../src/tileValues";
import { WebSocketCitySource } from "../src/webSocketCitySource";
import {
    memorySessionStore, serverTestsEnabled, signedInClient, START_SERVER_TIMEOUT_MS, startTestServer, TestServer,
} from "./helpers/testServer";

// The command line's connection against the real server, whose cities step on its own clock, so the commands a run
// sends apply on the city's next turn, as they do for a page (testServer.ts)

const describeOnServer = serverTestsEnabled() ? describe : describe.skip;

// A seed whose map has clear land at the road's tiles, as the shared city's suite builds on
const SEED = 2026;

describeOnServer("the command line against the server", () => {

    let server: TestServer | undefined;

    beforeAll(async () => {
        server = await startTestServer("server");
    }, START_SERVER_TIMEOUT_MS);

    afterAll(async () => {
        await server?.stop();
    });

    it("signs in once, then joins a city another player started and builds there", async () => {
        const owner = await signedInClient(server!.origin, memorySessionStore(), "Owner");

        try {
            const {city} = await new WebSocketCitySource(owner.client, () => {}).start({name: "Cli", seed: SEED, level: 0});
            const store = memorySessionStore();
            expect(await CityConnection.signIn(server!.origin, store, "Claude")).toBe("Claude");

            const connection = await CityConnection.open(server!.origin, store);
            try {
                await connection.join(city);
                const [result] = await connection.apply([
                    {type: "tool", tool: "road", path: [{x: 30, y: 30}, {x: 31, y: 30}], autoBulldoze: true},
                ]);

                expect(result.player).toBe(connection.me.id);
                expect(result.outcome).toBe("ok");
                const tile = connection.state.map.getTileValue(31, 30);
                expect(tile >= ROADBASE && tile <= LASTROAD).toBe(true);
                expect(connection.players().map(({name}) => name).sort()).toEqual(["Claude", "Owner"]);
            } finally {
                connection.close();
            }
        } finally {
            owner.environment.close();
        }
    });

    it("tells a run that hasn't signed in to sign in first", async () => {
        await expect(CityConnection.open(server!.origin, memorySessionStore())).rejects.toThrow("sign in first");
    });
});
