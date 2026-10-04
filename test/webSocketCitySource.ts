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
import { CityClient, CityClientEnvironment, SocketLike, StoredSession } from "../src/cityClient";
import { CITY_FAILED_CLOSE, QueryAnswer, StateMessage } from "../src/protocol";
import { WebSocketCitySource } from "../src/webSocketCitySource";
import { repositoryPath } from "./helpers/repository";

// The WebSocket source over a fake socket: what it sends, how it reads the answers, and what it does as the connection
// drops and comes back. test/citySource.ts runs the contract every source keeps against the real server.

const CLIENT_EXAMPLES = repositoryPath("protocol/examples/client");
const CITY = "0123456789abcdef0123456789abcdef";

// The close status a browser gives a connection that went without a close frame
const ABNORMAL_CLOSE = 1006;

class FakeSocket implements SocketLike {
    onmessage: ((event: {data: unknown}) => void) | null = null;
    onclose: ((event: {code: number}) => void) | null = null;
    readonly sent: Record<string, unknown>[] = [];

    send(data: string): void {
        this.sent.push(JSON.parse(data) as Record<string, unknown>);
    }

    deliver(message: unknown): void {
        this.onmessage?.({data: JSON.stringify(message)});
    }

    close(code = ABNORMAL_CLOSE): void {
        this.onclose?.({code});
    }
}

// A browser with a session the server accepts, whose reconnects the test runs
class FakeServer implements CityClientEnvironment {
    readonly sockets: FakeSocket[] = [];
    readonly reconnects: (() => void)[] = [];
    store = {load: (): StoredSession => ({token: "token", name: "Ada"}), save: () => {}};

    request(): Promise<{status: number, json(): Promise<unknown>}> {
        return Promise.resolve({status: 200, json: () => Promise.resolve({playerId: "id-Ada", name: "Ada"})});
    }

    openSocket(): SocketLike {
        const socket = new FakeSocket();
        this.sockets.push(socket);
        return socket;
    }

    exclusively<T>(task: () => Promise<T>): Promise<T> {
        return task();
    }

    schedule(callback: () => void): void {
        this.reconnects.push(callback);
    }

    get socket(): FakeSocket {
        return this.sockets[this.sockets.length - 1];
    }

    welcome(): void {
        this.socket.deliver({type: "hello", you: "id-Ada", players: [{id: "id-Ada", name: "Ada"}]});
    }

    // Runs the reconnect the client scheduled, and welcomes it
    async reconnect(): Promise<void> {
        this.reconnects.splice(0).forEach((reconnect) => reconnect());
        await settle();
        this.welcome();
    }

    // Answers the request last sent
    answer(value: unknown): void {
        this.socket.deliver({type: "answer", id: this.socket.sent[this.socket.sent.length - 1].id, value});
    }
}

function settle(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

interface Connected {
    server: FakeServer;
    source: WebSocketCitySource;
    lost: Error[];
}

async function connected(): Promise<Connected> {
    const server = new FakeServer();
    const client = new CityClient(server);
    await client.start();
    server.welcome();
    const lost: Error[] = [];
    return {server, source: new WebSocketCitySource(client, (error) => lost.push(error)), lost};
}

// Connected, and in the city, which the server started
async function inCity(): Promise<Connected> {
    const tested = await connected();
    const started = tested.source.start({name: "Town", seed: 2026, level: 0});
    tested.server.answer({city: CITY, name: "Town", seed: 2026});
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

    beforeEach(() => {
        warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => warn.mockRestore());

    it("sends each message as its example has it, in its fields' order", async () => {
        const {server, source} = await connected();
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

        const sent = new Map(server.socket.sent.map((message) => [message.type as string, message]));
        expect(examples.map((message) => JSON.stringify(withoutId(sent.get(message.type as string)!))))
            .toEqual(examples.map((message) => JSON.stringify(withoutId(message))));
    });

    it("delivers each batch's state messages in order, and answers each request by its id", async () => {
        const {server, source} = await connected();
        const delivered: StateMessage[] = [];
        source.subscribe((message) => delivered.push(message));
        const answers: QueryAnswer[] = [];

        const started = source.start({name: "Town", seed: 2026, level: 0});
        source.ask({type: "tileReport", x: 1, y: 1}, (answer) => answers.push(answer));
        const [start, query] = server.socket.sent;
        server.socket.deliver({type: "state", messages: [{type: "date", month: 0, year: 1900}, {type: "population", population: 0}]});
        server.socket.deliver({type: "answer", id: query.id, value: {type: "rejected", reason: "a reason"}});
        server.socket.deliver({type: "answer", id: start.id, value: {city: CITY, name: "Town", seed: 2026}});

        expect(await started).toEqual({name: "Town", seed: 2026, city: CITY});
        expect(answers).toEqual([{type: "rejected", reason: "a reason"}]);
        expect(delivered.map(({type}) => type)).toEqual(["date", "population"]);
    });

    it("fails a request with the server's words", async () => {
        const {server, source} = await connected();

        const saved = source.save();
        server.socket.deliver({type: "failed", id: server.socket.sent[0].id, error: "No city has started"});

        await expect(saved).rejects.toThrow("No city has started");
    });

    it("throws a failed query's error from its reply", async () => {
        const {server, source} = await connected();
        source.ask({type: "tileReport", x: 1, y: 1}, () => {});

        expect(() => server.socket.deliver({type: "failed", id: server.socket.sent[0].id, error: "No city has started"}))
            .toThrow("No city has started");
    });

    it("fails a request waiting when the connection drops", async () => {
        const {server, source} = await connected();
        const waiting = source.save();

        server.socket.close();

        await expect(waiting).rejects.toThrow("The connection to the server dropped");
    });

    it("fails a request at once while the connection is down", async () => {
        const {server, source} = await connected();
        server.socket.close();

        await expect(source.save()).rejects.toThrow("The connection to the server is down");
    });

    it("says a command sent while the connection is down is lost", async () => {
        const {server, source} = await connected();
        server.socket.close();

        source.send({type: "setSpeed", speed: 0});

        expect(warn).toHaveBeenCalledWith("A command was lost: the connection to the server is down", {type: "setSpeed", speed: 0});
    });

    it("says a query asked while the connection is down goes unanswered, and never replies", async () => {
        const {server, source} = await connected();
        server.socket.close();
        const reply = jest.fn();

        source.ask({type: "tileReport", x: 1, y: 1}, reply);

        expect(warn).toHaveBeenCalledWith("A query went unanswered: the connection to the server is down", {type: "tileReport", x: 1, y: 1});
        expect(reply).not.toHaveBeenCalled();
    });

    it("never replies to a query waiting when the connection drops", async () => {
        const {server, source} = await connected();
        const reply = jest.fn();
        source.ask({type: "tileReport", x: 1, y: 1}, reply);

        server.socket.close();

        expect(reply).not.toHaveBeenCalled();
    });

    it("joins its city again once the client reconnects, held as its driver was", async () => {
        const {server, source} = await inCity();
        const held = source.driver.hold();
        server.answer(null);
        await held;

        server.socket.close();
        await server.reconnect();

        expect(server.socket.sent.map(withoutId)).toEqual([{type: "hold"}, {type: "join", city: CITY}]);
    });

    it("joins its city again unheld once the client reconnects, when its driver wasn't held", async () => {
        const {server} = await inCity();

        server.socket.close();
        await server.reconnect();

        expect(server.socket.sent.map(withoutId)).toEqual([{type: "join", city: CITY}]);
    });

    it("joins no city once the client reconnects, before any city has started", async () => {
        const {server} = await connected();

        server.socket.close();
        await server.reconnect();

        expect(server.socket.sent).toEqual([]);
    });

    it("loses its city when joining it again fails, and joins no city after", async () => {
        const {server, lost} = await inCity();
        server.socket.close();
        await server.reconnect();

        server.socket.deliver({type: "failed", id: server.socket.sent[0].id, error: "No city has the id"});
        await settle();
        server.socket.close();
        await server.reconnect();

        expect(lost.map(({message}) => message)).toEqual(["Joining the city again failed: No city has the id"]);
        expect(server.socket.sent).toEqual([]);
    });

    it("loses its city when the city fails on the server, and doesn't join it again", async () => {
        const {server, lost} = await inCity();

        server.socket.close(CITY_FAILED_CLOSE);
        await server.reconnect();

        expect(lost.map(({message}) => message)).toEqual(["The city failed on the server, which keeps it as it was last saved"]);
        expect(server.socket.sent).toEqual([]);
    });

    it("keeps its city when the connection drops again before it has joined it again", async () => {
        const {server, lost} = await inCity();
        server.socket.close();
        await server.reconnect();

        server.socket.close();
        await settle();
        await server.reconnect();

        expect(lost).toEqual([]);
        expect(server.socket.sent.map(withoutId)).toEqual([{type: "join", city: CITY}]);
    });

    it("refuses an answer to a request it never made", async () => {
        const {server} = await connected();

        expect(() => server.socket.deliver({type: "answer", id: 99, value: null}))
            .toThrow("The server answered request 99, which was never made or already answered");
    });
});
