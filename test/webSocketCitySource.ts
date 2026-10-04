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

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { CityClient } from "../src/cityClient";
import { CITY_FAILED_CLOSE, QueryAnswer, StateMessage } from "../src/protocol";
import { WebSocketCitySource } from "../src/webSocketCitySource";
import { FakeBrowser, FakeSocket, respond, settle } from "./helpers/fakeBrowser";
import { repositoryPath } from "./helpers/repository";

// The WebSocket source over a fake browser: what it sends, how it reads the answers, and what it does as the connection
// drops and comes back. test/citySource.ts runs the contract every source keeps against the real server.

const CLIENT_EXAMPLES = repositoryPath("protocol/examples/client");
const CITY = "0123456789abcdef0123456789abcdef";

// A source over a browser whose stored session the server accepts, and what it says when it loses its city
class Connected {
    readonly browser = new FakeBrowser(() => respond(200, {playerId: "id-Ada", name: "Ada"}));
    readonly client = new CityClient(this.browser);
    readonly lost: Error[] = [];
    readonly source = new WebSocketCitySource(this.client, (error) => this.lost.push(error));

    constructor() {
        this.browser.stored = {token: "token", name: "Ada"};
    }

    get socket(): FakeSocket {
        return this.browser.lastSocket();
    }

    // What the source sent on the socket now open, each read back as the object it is
    get sent(): Record<string, unknown>[] {
        return this.socket.sentMessages();
    }

    welcome(): void {
        this.socket.deliver({type: "hello", you: "id-Ada", players: [{id: "id-Ada", name: "Ada"}]});
    }

    // Runs the reconnect the client scheduled, and welcomes it
    async reconnect(): Promise<void> {
        await this.browser.runScheduled();
        this.welcome();
    }

    // Answers the request last sent
    answer(value: unknown): void {
        this.socket.deliver({type: "answer", id: this.sent[this.sent.length - 1].id, value});
    }

    // Fails the request last sent
    fail(error: string): void {
        this.socket.deliver({type: "failed", id: this.sent[this.sent.length - 1].id, error});
    }
}

async function connected(): Promise<Connected> {
    const tested = new Connected();
    await tested.client.start();
    tested.welcome();
    return tested;
}

// Connected, and in the city, which the server started
async function inCity(): Promise<Connected> {
    const tested = await connected();
    const started = tested.source.start({name: "Town", seed: 2026, level: 0});
    tested.answer({city: CITY, name: "Town", seed: 2026});
    await started;
    return tested;
}

// A message without its request id, which differs from call to call
function withoutId(message: Record<string, unknown>): Record<string, unknown> {
    const rest = {...message};
    delete rest.id;
    return rest;
}

describe("the WebSocket source", () => {

    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
        error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it("sends each message as its example has it, in its fields' order", async () => {
        const {source, socket} = await connected();
        const examples = readdirSync(CLIENT_EXAMPLES).map((file) =>
            JSON.parse(readFileSync(join(CLIENT_EXAMPLES, file), "utf8")) as Record<string, unknown>);
        const example = (type: string) => examples.find((message) => message.type === type)!;
        const field = <T>(type: string, name: string) => example(type)[name] as T;

        source.driver.hold().catch(() => {});
        source.driver.release().catch(() => {});
        source.driver.flush().catch(() => {});
        source.driver.advance(field("advance", "steps")).catch(() => {});
        source.driver.cityTime().catch(() => {});
        source.start({name: field("start", "name"), seed: field("start", "seed"), level: field("start", "level")}).catch(() => {});
        source.start({save: field("upload", "save")}).catch(() => {});
        source.join(field("join", "city")).catch(() => {});
        source.send(field("command", "command"));
        source.ask(field("query", "query"), () => {});
        source.save().catch(() => {});
        source.commandLog().catch(() => {});
        source.turn(field("turn", "milliseconds")).catch(() => {});

        const sent = new Map(socket.sentMessages().map((message) => [message.type as string, message]));
        expect(examples.map((message) => JSON.stringify(withoutId(sent.get(message.type as string)!))))
            .toEqual(examples.map((message) => JSON.stringify(withoutId(message))));
    });

    it("delivers each batch's state messages in order, and answers each request by its id", async () => {
        const tested = await connected();
        const delivered: StateMessage[] = [];
        tested.source.subscribe((message) => delivered.push(message));
        const answers: QueryAnswer[] = [];

        const started = tested.source.start({name: "Town", seed: 2026, level: 0});
        tested.source.ask({type: "tileReport", x: 1, y: 1}, (answer) => answers.push(answer));
        const [start, query] = tested.sent;
        tested.socket.deliver({type: "state", messages: [{type: "date", month: 0, year: 1900}, {type: "population", population: 0}]});
        tested.socket.deliver({type: "answer", id: query.id, value: {type: "rejected", reason: "a reason"}});
        tested.socket.deliver({type: "answer", id: start.id, value: {city: CITY, name: "Town", seed: 2026}});

        expect(await started).toEqual({name: "Town", seed: 2026, city: CITY});
        expect(answers).toEqual([{type: "rejected", reason: "a reason"}]);
        expect(delivered.map(({type}) => type)).toEqual(["date", "population"]);
    });

    it("fails a request with the server's words", async () => {
        const tested = await connected();

        const saved = tested.source.save();
        tested.fail("No city has started");

        await expect(saved).rejects.toThrow("No city has started");
    });

    it("throws a failed query's error from its reply", async () => {
        const tested = await connected();
        tested.source.ask({type: "tileReport", x: 1, y: 1}, () => {});

        expect(() => tested.fail("No city has started")).toThrow("No city has started");
    });

    it("is the player the server welcomed, and no player while the connection is down", async () => {
        const tested = await connected();
        const welcomed = tested.source.player;

        tested.socket.drop();

        expect(welcomed).toBe("id-Ada");
        expect(tested.source.player).toBe("");
    });

    it.each([
        ["a request", (tested: Connected) => tested.source.save()],
        ["a start", (tested: Connected) => tested.source.start({name: "Town", seed: 2026, level: 0})],
        ["a join", (tested: Connected) => tested.source.join(CITY)],
    ])("fails %s waiting when the connection drops", async (_, call) => {
        const tested = await connected();
        const waiting = call(tested);

        tested.socket.drop();

        await expect(waiting).rejects.toThrow("The connection to the server dropped");
    });

    it("fails a request at once while the connection is down", async () => {
        const tested = await connected();
        tested.socket.drop();

        await expect(tested.source.save()).rejects.toThrow("The connection to the server is down");
    });

    it("says a command sent while the connection is down is lost", async () => {
        const tested = await connected();
        tested.socket.drop();

        tested.source.send({type: "setSpeed", speed: 0});

        expect(warn).toHaveBeenCalledWith("A command was lost: the connection to the server is down", {type: "setSpeed", speed: 0});
    });

    it("says a query asked while the connection is down goes unanswered, and never replies", async () => {
        const tested = await connected();
        tested.socket.drop();
        const reply = jest.fn();

        tested.source.ask({type: "tileReport", x: 1, y: 1}, reply);

        expect(warn).toHaveBeenCalledWith("A query went unanswered: The connection to the server is down", {type: "tileReport", x: 1, y: 1});
        expect(reply).not.toHaveBeenCalled();
    });

    it("says a query waiting when the connection drops goes unanswered, and never replies", async () => {
        const tested = await connected();
        const reply = jest.fn();
        tested.source.ask({type: "tileReport", x: 1, y: 1}, reply);

        tested.socket.drop();

        expect(warn).toHaveBeenCalledWith("A query went unanswered: The connection to the server dropped", {type: "tileReport", x: 1, y: 1});
        expect(reply).not.toHaveBeenCalled();
    });

    it("joins its city again once the client reconnects, held as its driver was", async () => {
        const tested = await inCity();
        const held = tested.source.driver.hold();
        tested.answer(null);
        await held;

        tested.socket.drop();
        await tested.reconnect();

        expect(tested.sent.map(withoutId)).toEqual([{type: "hold"}, {type: "join", city: CITY}]);
    });

    it("says so when holding its city again fails as it rejoins, and joins it all the same", async () => {
        const tested = await inCity();
        const held = tested.source.driver.hold();
        tested.answer(null);
        await held;
        tested.socket.drop();
        await tested.reconnect();
        const [hold] = tested.sent;

        tested.socket.deliver({type: "failed", id: hold.id, error: "This server has no debug channel"});
        tested.answer({city: CITY, name: "Town", seed: 2026});
        await settle();

        expect(error).toHaveBeenCalledWith(`Holding city ${CITY} again failed`, new Error("This server has no debug channel"));
        expect(tested.lost).toEqual([]);
    });

    it("joins its city again unheld once the client reconnects, when its driver wasn't held", async () => {
        const tested = await inCity();

        tested.socket.drop();
        await tested.reconnect();

        expect(tested.sent.map(withoutId)).toEqual([{type: "join", city: CITY}]);
    });

    it("joins no city once the client reconnects, before any city has started", async () => {
        const tested = await connected();

        tested.socket.drop();
        await tested.reconnect();

        expect(tested.sent).toEqual([]);
    });

    it("loses its city when joining it again fails, and joins no city after", async () => {
        const tested = await inCity();
        tested.socket.drop();
        await tested.reconnect();

        tested.fail("No city has the id");
        await settle();
        tested.socket.drop();
        await tested.reconnect();

        expect(tested.lost.map(({message}) => message)).toEqual(["Joining the city again failed: No city has the id"]);
        expect(tested.sent).toEqual([]);
    });

    it("loses its city when the city fails on the server, and doesn't join it again", async () => {
        const tested = await inCity();

        tested.socket.drop(CITY_FAILED_CLOSE);
        await tested.reconnect();

        expect(tested.lost.map(({message}) => message)).toEqual(["The city failed on the server, which keeps it as it was last saved"]);
        expect(tested.sent).toEqual([]);
    });

    it("keeps its city when the connection drops again before it has joined it again", async () => {
        const tested = await inCity();
        tested.socket.drop();
        await tested.reconnect();

        tested.socket.drop();
        await settle();
        await tested.reconnect();

        expect(tested.lost).toEqual([]);
        expect(tested.sent.map(withoutId)).toEqual([{type: "join", city: CITY}]);
    });

    it("refuses an answer to a request it never made", async () => {
        const tested = await connected();

        expect(() => tested.socket.deliver({type: "answer", id: 99, value: null}))
            .toThrow("The server answered request 99, which was never made or already answered");
    });
});
