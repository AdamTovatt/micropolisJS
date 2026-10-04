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

import { RUN_STEPS } from "../headless/fixtures/fixture";
import { fixtureSave, replay } from "../headless/runner";
import type { SessionStore } from "../src/cityClient";
import type { CitySource } from "../src/citySource";
import { CityState } from "../src/cityState";
import { CHECKPOINT_INTERVAL, CommandLog } from "../src/commandLog";
import { Command, CommandResult, StateMessage } from "../src/protocol";
import { SaveFormat } from "../src/savedGame";
import { SPRITE_AIRPLANE, SPRITE_SHIP, SPRITE_TORNADO, SPRITE_TRAIN } from "../src/spriteConstants";
import { WebSocketCitySource } from "../src/webSocketCitySource";
import { pageSource } from "./helpers/citySources";
import {
    memorySessionStore, NodeCityEnvironment, serverTestsEnabled, signedInClient, START_SERVER_TIMEOUT_MS, startTestServer,
    TestServer,
} from "./helpers/testServer";

// One city on the server, run by two players, as CLAUDE.md's Decided multiplayer shape has it: both players' commands go
// into the city's one stream in the order the server receives them, both receive the same state, and the city's one log
// replays headless in TypeScript to every checkpoint the server's C# rules hashed. That replay, and the same city's
// state messages from the browser's host, are the end-to-end conformance check of the server's step loop. A tornado
// puts a sprite on the map, which the state messages draw and the news follows.

const describeOnServer = serverTestsEnabled() ? describe : describe.skip;

// How long a test waits for a client to reconnect and join its city again, past the first reconnect's delay
const REJOIN_TIMEOUT_MS = 10000;

// The commands the two players send, in turn, on clear land of the seed's map
const SEED = 2026;
const COMMANDS: Command[] = [
    {type: "tool", tool: "road", path: [{x: 30, y: 30}, {x: 31, y: 30}], autoBulldoze: true},
    {type: "tool", tool: "residential", path: [{x: 32, y: 32}], autoBulldoze: true},
    {type: "tool", tool: "wire", path: [{x: 30, y: 31}], autoBulldoze: true},
    {type: "setSpeed", speed: 3},
    {type: "triggerDisaster", kind: "tornado"},
];

// The fixture whose city has a train, a plane and a ship at the end of its run
const SPRITES_FIXTURE = "harbour";

// A player in the browser: a session of its own, on a connection of its own
interface Player {
    source: WebSocketCitySource;
    state: CityState;
    messages: StateMessage[];
    environment: NodeCityEnvironment;
    // Why the source lost its city, each time it did
    lost: Error[];
}

describeOnServer("a city two players share", () => {

    let server: TestServer | undefined;
    let players: Player[] = [];

    beforeAll(async () => {
        server = await startTestServer();
    }, START_SERVER_TIMEOUT_MS);

    afterAll(async () => {
        await server?.stop();
    });

    afterEach(() => {
        players.forEach((player) => player.environment.close());
        players = [];
    });

    // Each name signs in once for the suite, and connects as that player again in each test after, as a returning
    // browser does, so the suite stays well inside the server's limit on sign-ins from one address
    const sessions = new Map<string, SessionStore>();

    async function signIn(name: string): Promise<Player> {
        const store = sessions.get(name) ?? memorySessionStore();
        sessions.set(name, store);
        const {client, environment} = await signedInClient(server!.origin, store, name);
        const lost: Error[] = [];
        const source = new WebSocketCitySource(client, (error) => lost.push(error));
        const messages: StateMessage[] = [];
        const player = {source, state: new CityState(source), messages, environment, lost};
        source.subscribe((message) => messages.push(message));
        players.push(player);
        return player;
    }

    // Sends the command, and waits until the city has it: an answered request comes after it on the connection
    async function sendArrived(source: CitySource, command: Command): Promise<void> {
        source.send(command);
        await source.driver.cityTime();
    }

    function tiles(player: {state: CityState}): number[] {
        const map = player.state.map;
        return map.getTileValuesForPainting(0, 0, map.width, map.height, []);
    }

    function results(messages: StateMessage[]): CommandResult[] {
        return messages.flatMap((message) => (message.type === "commandResult" ? [message.result] : []));
    }

    async function waitFor(condition: () => boolean, what: string): Promise<void> {
        const giveUp = Date.now() + REJOIN_TIMEOUT_MS;
        while (!condition()) {
            if (Date.now() > giveUp) {
                throw new Error(`Waited ${REJOIN_TIMEOUT_MS} ms for ${what}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    it("applies both players' commands in the order they arrived, sends both the same state, and logs one stream " +
       "that replays in TypeScript to every checkpoint", async () => {
        const ada = await signIn("Ada");
        const grace = await signIn("Grace");
        await ada.source.driver.hold();
        const started = await ada.source.start({name: "Shared", seed: SEED, level: 0});
        await grace.source.join(started.city!);
        const adaBefore = ada.messages.length;
        const graceBefore = grace.messages.length;
        const senders = COMMANDS.map((_, i) => (i % 2 === 0 ? ada : grace));

        for (let i = 0; i < COMMANDS.length; i++) {
            await sendArrived(senders[i].source, COMMANDS[i]);
        }
        const advanced = await ada.source.driver.advance(CHECKPOINT_INTERVAL + 400);
        await grace.source.driver.cityTime();

        expect(advanced).toEqual({steps: CHECKPOINT_INTERVAL + 400, budgetReviewDue: false, error: null});
        expect(ada.source.player).not.toBe(grace.source.player);
        expect(grace.messages.slice(graceBefore)).toEqual(ada.messages.slice(adaBefore));
        expect(tiles(grace)).toEqual(tiles(ada));
        expect(results(ada.messages)).toEqual(COMMANDS.map((command, i) =>
            ({player: senders[i].source.player, command, outcome: "ok", reason: null})));

        const recorded = await grace.source.commandLog();
        const log = recorded.log as CommandLog;
        expect(log.entries.map(({player, command}) => ({player, command})))
            .toEqual(COMMANDS.map((command, i) => ({player: senders[i].source.player, command})));
        // From step 0, past the first interval, to the city now
        expect(log.checkpoints.map(({step}) => step)).toEqual([0, CHECKPOINT_INTERVAL, CHECKPOINT_INTERVAL + 400]);
        expect(await replay(log).verified).toBe(3);
    });

    it("sends what the browser's host sends for the same city and commands", async () => {
        const ada = await signIn("Ada");
        const page = await pageSource.create();
        const pageMessages: StateMessage[] = [];
        page.source.subscribe((message) => pageMessages.push(message));

        try {
            for (const source of [ada.source, page.source]) {
                await source.driver.hold();
                await source.start({name: "Same", seed: SEED, level: 0});
                COMMANDS.forEach((command) => source.send(command));
                // A step first, whose batch draws the tornado, which a long advance's one batch may come after
                await source.driver.advance(1);
                await source.driver.advance(CHECKPOINT_INTERVAL + 399);
            }

            const drawn = pageMessages.flatMap((message) => (message.type === "sprites" ? message.sprites : []));
            expect(drawn.map(({type}) => type)).toContain(SPRITE_TORNADO);

            // Each command result names its player, which on the page is the one local player
            const asOnThePage = ada.messages.map((message) => (message.type === "commandResult"
                ? {...message, result: {...message.result, player: page.source.player}}
                : message));
            expect(asOnThePage).toEqual(pageMessages);
        } finally {
            page.close();
        }
    });

    it("sends what the browser's host sends for a saved city whose trains, planes and ships come and go", async () => {
        const ada = await signIn("Ada");
        const page = await pageSource.create();
        const pageMessages: StateMessage[] = [];
        page.source.subscribe((message) => pageMessages.push(message));
        const save = SaveFormat.serialise({...fixtureSave(SPRITES_FIXTURE), name: "Harbour"});

        try {
            for (const source of [ada.source, page.source]) {
                await source.driver.hold();
                await source.start({save});
                await source.driver.advance(RUN_STEPS);
            }

            const drawn = pageMessages.flatMap((message) => (message.type === "sprites" ? message.sprites : []))
                .map(({type}) => type);
            expect(Array.from(new Set(drawn)).sort()).toEqual([SPRITE_TRAIN, SPRITE_AIRPLANE, SPRITE_SHIP].sort());
            expect(ada.messages).toEqual(pageMessages);
        } finally {
            page.close();
        }
    });

    it("gives a player who joins the whole city as it stands", async () => {
        const ada = await signIn("Ada");
        await ada.source.driver.hold();
        const started = await ada.source.start({name: "Shared", seed: SEED, level: 0});
        await sendArrived(ada.source, COMMANDS[0]);
        const advanced = await ada.source.driver.advance(480);

        const grace = await signIn("Grace");
        await grace.source.join(started.city!);

        expect(advanced.error).toBeNull();
        expect(results(ada.messages).map(({outcome}) => outcome)).toEqual(["ok"]);
        expect(tiles(grace)).toEqual(tiles(ada));
        expect(grace.state.current("date")).toEqual(ada.state.current("date"));
        expect(grace.state.current("budget")).toEqual(ada.state.current("budget"));
    });

    it("joins its city again once the connection is back, with what changed while it was down", async () => {
        const ada = await signIn("Ada");
        const grace = await signIn("Grace");
        await ada.source.driver.hold();
        const started = await ada.source.start({name: "Shared", seed: SEED, level: 0});
        await grace.source.join(started.city!);
        const before = ada.messages.length;

        ada.environment.drop();
        await sendArrived(grace.source, COMMANDS[0]);
        await grace.source.driver.flush();
        await waitFor(() => ada.messages.slice(before).some(({type}) => type === "map"), "Ada to join the city again");

        expect(tiles(ada)).toEqual(tiles(grace));
        // In the city's one stream again
        await sendArrived(ada.source, COMMANDS[2]);
        await ada.source.driver.flush();
        // Ada's flush is answered on her socket alone: a request of Grace's own, answered after it, comes after the
        // batch on hers
        await grace.source.driver.cityTime();
        expect(results(grace.messages).map(({player}) => player)).toEqual([grace.source.player, ada.source.player]);
        expect(ada.lost).toEqual([]);
    });

    // The city's last player dropping unloads it, so it loads again as she rejoins, unheld unless she holds it again
    it("holds its city again as it joins it again, as its driver was held", async () => {
        const ada = await signIn("Ada");
        await ada.source.driver.hold();
        await ada.source.start({name: "Alone", seed: SEED, level: 0});
        const before = ada.messages.length;

        ada.environment.drop();
        await waitFor(() => ada.messages.slice(before).some(({type}) => type === "map"), "Ada to join the city again");
        // A second on the city's clock: the first turn only starts it
        await ada.source.turn(1000);
        await ada.source.turn(1000);

        expect(await ada.source.driver.cityTime()).toBe(0);
        expect(ada.lost).toEqual([]);
    });
});
