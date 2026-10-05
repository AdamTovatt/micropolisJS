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

import { WebSocketCitySource } from "../../src/webSocketCitySource";
import { Entry } from "../helpers/recordings";
import {
    memorySessionStore, NodeCityEnvironment, signedInClient, startTestServer, TestServer,
} from "../helpers/testServer";
import { RecordingBuilder, withNames, writeRecording } from "./recordingFile";
import { RecordingSource } from "./recordingSource";
import { RecordingSession, Scenario, SCENARIOS } from "./scenarios";

// Records the state-message streams and query answers the client's tests play back through the fake city source
// (test/helpers/fakeCitySource.ts), from the C# server: the Debug build `dotnet build server/Micropolis.slnx` makes,
// started in its test configuration (test/helpers/testServer.ts), whose cities step only as the debug driver advances
// them. It writes test/recordings/<scenario>.json for each scenario of scenarios.ts, from a city of its own for each
// branch, and fails unless every branch's opening records the same. Run it with `npm run record`, from the
// repository's root, as npm runs it.
//
// The ids the server makes up, of the players and of each city a branch starts, in order, are written as the names
// below, so a recording made again is the same file unless what the server sends changed.

const PLAYER = "player";
const ANOTHER_PLAYER = "another player";
const CITY = "city";

// The two players of every branch, each signed in once, as returning browsers connect again: the server limits how
// many sign-ins one address makes a minute
class Players {
    private readonly stores = {player: memorySessionStore(), another: memorySessionStore()};
    private readonly environments: NodeCityEnvironment[] = [];

    constructor(private readonly server: TestServer) {}

    async connect(who: "player" | "another"): Promise<WebSocketCitySource> {
        const {client, environment} = await signedInClient(this.server.origin, this.stores[who], who);
        this.environments.push(environment);
        return new WebSocketCitySource(client, (error) => {
            throw new Error(`The ${who}'s source lost its city: ${error.message}`);
        });
    }

    closeAll(): void {
        this.environments.splice(0).forEach((environment) => environment.close());
    }
}

// The opening and the branch recorded on a city of their own, the ids named
async function recordBranch(players: Players, scenario: Scenario, branch: string):
    Promise<{opening: Entry[], branch: Entry[]}> {
    const source = new RecordingSource(await players.connect("player"));
    const names = new Map([[source.player, PLAYER]]);
    let joined: Promise<WebSocketCitySource> | null = null;

    // Another player joins the city the source started last as its first command comes
    const anotherPlayer = async () => {
        const another = await players.connect("another");
        await another.join(source.cities[source.cities.length - 1]);
        names.set(another.player, ANOTHER_PLAYER);
        return another;
    };

    const session: RecordingSession = {
        source,
        fromAnotherPlayer: async (command) => {
            joined ??= anotherPlayer();
            const another = await joined;
            another.send(command);
            // An answered request comes after the command on the same connection, so the city has it
            await another.driver.cityTime();
        },
    };

    try {
        await scenario.opening(source);
        const opening = source.take();
        await scenario.branches[branch](session);
        const recorded = source.take();

        source.cities.forEach((city, i) => names.set(city, i === 0 ? CITY : `${CITY} ${i + 1}`));

        return {opening: withNames(opening, names), branch: withNames(recorded, names)};
    } finally {
        players.closeAll();
    }
}

async function main(): Promise<void> {
    const root = process.cwd();
    const server = await startTestServer("manual", root);
    try {
        const players = new Players(server);
        for (const [name, scenario] of Object.entries(SCENARIOS)) {
            const recording = new RecordingBuilder(name, PLAYER);
            for (const branch of Object.keys(scenario.branches)) {
                recording.add(branch, await recordBranch(players, scenario, branch));
            }

            writeRecording(name, recording.build(), root);
            console.log(`Recorded ${name}: ${Object.keys(scenario.branches).length} branches`);
        }
    } finally {
        await server.stop();
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
