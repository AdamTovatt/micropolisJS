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

import { CITY_PATH, CityClient, CityStatus, ResponseLike, SESSION_PATH } from "../src/cityClient";
import { CITY_FAILED_CLOSE, CityMessage, ErrorResponse, PlayerResponse, SessionResponse } from "../src/protocol";
import { FakeBrowser, Handler, respond } from "./helpers/fakeBrowser";

// The server's bodies, typed by the protocol, so a field renamed there fails to compile here
function session(body: SessionResponse): ResponseLike {
    return respond(200, body);
}

function player(body: PlayerResponse): ResponseLike {
    return respond(200, body);
}

function refusal(status: 400 | 429, body: ErrorResponse): ResponseLike {
    return respond(status, body);
}

function notJson(status: number): ResponseLike {
    return {status, json: () => Promise.reject(new SyntaxError("Unexpected token <"))};
}

const noServer: Handler = () => { throw new TypeError("Failed to fetch"); };

const NAME_RULE = "A name is 1 to 32 characters long.";

// A server that knows the given tokens and issues numbered ones, refusing a blank name or any in refusedNames
function server(validTokens: string[], tokenPrefix = "token", refusedNames: string[] = []): Handler {
    let issued = 0;

    return (request) => {
        if (request.method === "GET") {
            const token = (request.headers.Authorization ?? "").replace("Bearer ", "");
            return validTokens.includes(token) ? player({playerId: `id-${token}`, name: "Stored"}) : respond(401, null);
        }

        const {name} = JSON.parse(request.body ?? "{}");

        if (name.trim() === "" || refusedNames.includes(name)) {
            return refusal(400, {error: NAME_RULE});
        }

        issued++;
        validTokens.push(`${tokenPrefix}-${issued}`);
        return session({token: `${tokenPrefix}-${issued}`, name: name.trim()});
    };
}

// A server that rejects every token and answers every sign-in with the given response
function rejectingTokensAndAnswering(signIn: ResponseLike | Error): Handler {
    return (request) => {
        if (request.method === "GET") {
            return respond(401, null);
        }

        if (signIn instanceof Error) {
            throw signIn;
        }

        return signIn;
    };
}

function hello(you: string, ...names: string[]): unknown {
    return {type: "hello", you, players: names.map((name) => ({id: `id-${name}`, name}))};
}

describe("the city client", () => {

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("starting", () => {

        it.each([
            ["no server at all", noServer],
            ["a dev server whose backend is down", () => notJson(504)],
            ["a static host answering with a page", () => notJson(200)],
            ["a static host without the endpoint", () => respond(404, null)],
            ["a server answering with something else than a player", () => respond(200, {user: "Ada"})],
        ])("is offline with %s", async (_, handler) => {
            const browser = new FakeBrowser(handler);
            const client = new CityClient(browser);

            expect(await client.start()).toBe("offline");
            expect(client.getStatus()).toEqual({online: false});
            expect(browser.sockets).toHaveLength(0);
        });

        it("needs a name when the server answers and nothing is stored", async () => {
            const browser = new FakeBrowser(server([]));

            expect(await new CityClient(browser).start()).toBe("needs-name");
            expect(browser.requests).toEqual([{path: SESSION_PATH, method: "GET", headers: {}}]);
            expect(browser.sockets).toHaveLength(0);
        });

        it("connects with a stored session the server accepts", async () => {
            const browser = new FakeBrowser(server(["kept"]));
            browser.stored = {token: "kept", name: "Ada"};

            expect(await new CityClient(browser).start()).toBe("signed-in");
            expect(browser.requests[0].headers).toEqual({Authorization: "Bearer kept"});
            expect(browser.lastSocket().pathAndQuery).toBe(`${CITY_PATH}?access_token=kept`);
        });

        it("signs in again under the stored name when the server rejects the stored token", async () => {
            const browser = new FakeBrowser(server([]));
            browser.stored = {token: "expired", name: "Ada"};

            expect(await new CityClient(browser).start()).toBe("signed-in");
            expect(JSON.parse(browser.requests[1].body ?? "")).toEqual({name: "Ada"});
            expect(browser.stored).toEqual({token: "token-1", name: "Ada"});
            expect(browser.lastSocket().pathAndQuery).toBe(`${CITY_PATH}?access_token=token-1`);
        });

        it("needs a new name when the server rejects the stored token and refuses the stored name", async () => {
            const browser = new FakeBrowser(server([], "token", ["Ada"]));
            browser.stored = {token: "expired", name: "Ada"};

            expect(await new CityClient(browser).start()).toBe("needs-name");
            expect(browser.sockets).toHaveLength(0);
        });

        it.each([
            ["the server has gone", new TypeError("Failed to fetch")],
            ["the server limits sign-ins", refusal(429, {error: "Too many sign-ins from here."})],
        ])("is offline when the server rejects the stored token and %s, and signs in once it can", async (_, signIn) => {
            const browser = new FakeBrowser(rejectingTokensAndAnswering(signIn));
            browser.stored = {token: "expired", name: "Ada"};

            expect(await new CityClient(browser).start()).toBe("offline");
            expect(browser.sockets).toHaveLength(0);
            expect(browser.scheduled.map((entry) => entry.delayMs)).toEqual([1000]);

            browser.handler = server([]);
            await browser.runScheduled();

            expect(browser.lastSocket().pathAndQuery).toBe(`${CITY_PATH}?access_token=token-1`);
            expect(browser.stored).toEqual({token: "token-1", name: "Ada"});
        });
    });

    describe("signing in", () => {

        it("stores the session and connects", async () => {
            const browser = new FakeBrowser(server([]));
            const client = new CityClient(browser);

            expect(await client.signIn(" Ada ")).toEqual({outcome: "signed-in"});
            expect(browser.stored).toEqual({token: "token-1", name: "Ada"});
            expect(browser.lastSocket().pathAndQuery).toBe(`${CITY_PATH}?access_token=token-1`);
        });

        it("passes on the server's reason for refusing a name, and stores nothing", async () => {
            const browser = new FakeBrowser(server([]));

            expect(await new CityClient(browser).signIn(" ")).toEqual({outcome: "rejected", error: NAME_RULE});
            expect(browser.stored).toBeNull();
            expect(browser.sockets).toHaveLength(0);
        });

        it("passes on the server's reason for limiting sign-ins", async () => {
            const browser = new FakeBrowser(() => refusal(429, {error: "Too many sign-ins from here."}));

            expect(await new CityClient(browser).signIn("Ada")).toEqual({outcome: "too-many", error: "Too many sign-ins from here."});
        });

        it.each([
            ["the server has gone", noServer],
            ["a refusal without a reason", () => respond(400, {message: "Bad Request"})],
            ["a session missing its token", () => respond(200, {name: "Ada"})],
            ["a page instead of a session", () => notJson(200)],
        ])("is offline, storing nothing, with %s", async (_, handler) => {
            const browser = new FakeBrowser(handler);

            expect(await new CityClient(browser).signIn("Ada")).toEqual({outcome: "offline"});
            expect(browser.stored).toBeNull();
            expect(browser.sockets).toHaveLength(0);
        });

        it("keeps signing in under the name when the server has gone since it answered", async () => {
            const browser = new FakeBrowser(noServer);
            await new CityClient(browser).signIn("Ada");
            expect(browser.scheduled.map((entry) => entry.delayMs)).toEqual([1000]);
            await browser.runScheduled();
            browser.handler = server([]);

            await browser.runScheduled();

            expect(browser.lastSocket().pathAndQuery).toBe(`${CITY_PATH}?access_token=token-1`);
            expect(browser.stored).toEqual({token: "token-1", name: "Ada"});
        });

        it("does not retry a sign-in the server limits, which the player tries again", async () => {
            const browser = new FakeBrowser(() => refusal(429, {error: "Too many sign-ins from here."}));

            await new CityClient(browser).signIn("Ada");

            expect(browser.scheduled).toHaveLength(0);
        });

        it("joins as the player another tab signed in as while this one asked for a name", async () => {
            const browser = new FakeBrowser(server([]));
            const firstTab = new CityClient(browser);
            const secondTab = new CityClient(browser);
            expect(await secondTab.start()).toBe("needs-name");
            await firstTab.signIn("Ada");

            expect(await secondTab.signIn("Bo")).toEqual({outcome: "signed-in"});

            expect(browser.signIns()).toHaveLength(1);
            expect(browser.lastSocket().pathAndQuery).toBe(`${CITY_PATH}?access_token=token-1`);
        });
    });

    describe("connected", () => {

        async function signedIn(): Promise<{browser: FakeBrowser; client: CityClient; statuses: CityStatus[]}> {
            const browser = new FakeBrowser(server([]));
            const client = new CityClient(browser);
            const statuses: CityStatus[] = [];
            client.onStatus((status) => statuses.push(status));
            await client.signIn("Ada");
            return {browser, client, statuses};
        }

        it("is online with the players the hello lists", async () => {
            const {browser, client} = await signedIn();

            browser.lastSocket().deliver(hello("id-Ada", "Grace", "Ada"));

            expect(client.getStatus()).toEqual({
                online: true, you: "id-Ada", players: [{id: "id-Grace", name: "Grace"}, {id: "id-Ada", name: "Ada"}],
            });
        });

        it("follows the players coming and going", async () => {
            const {browser, client} = await signedIn();
            browser.lastSocket().deliver(hello("id-Ada", "Ada"));

            browser.lastSocket().deliver({type: "players", players: [{id: "id-Ada", name: "Ada"}, {id: "id-Bo", name: "Bo"}]});

            expect(client.getStatus()).toEqual({
                online: true, you: "id-Ada", players: [{id: "id-Ada", name: "Ada"}, {id: "id-Bo", name: "Bo"}],
            });
        });

        it("stays offline on a players message before the hello", async () => {
            const {browser, client} = await signedIn();

            browser.lastSocket().deliver({type: "players", players: [{id: "id-Bo", name: "Bo"}]});

            expect(client.getStatus()).toEqual({online: false});
        });

        it("ignores a message it cannot read", async () => {
            const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
            const {browser, client} = await signedIn();
            browser.lastSocket().deliver(hello("id-Ada", "Ada"));

            browser.lastSocket().deliver("{\"type\":\"goodbye\"}");

            expect(client.getStatus()).toEqual({online: true, you: "id-Ada", players: [{id: "id-Ada", name: "Ada"}]});
            expect(warn).toHaveBeenCalled();
        });

        it("ignores a binary message", async () => {
            const {browser, client} = await signedIn();
            browser.lastSocket().deliver(hello("id-Ada", "Ada"));

            browser.lastSocket().onmessage?.({data: new ArrayBuffer(4)});

            expect(client.getStatus()).toEqual({online: true, you: "id-Ada", players: [{id: "id-Ada", name: "Ada"}]});
        });

        it("tells its listeners of every change, starting with the status when they subscribe", async () => {
            const {browser, statuses} = await signedIn();

            browser.lastSocket().deliver(hello("id-Ada", "Ada"));
            browser.lastSocket().drop();

            expect(statuses.map((status) => status.online)).toEqual([false, true, false]);
        });

        it("says it is welcomed once the hello comes, and at once after", async () => {
            const {browser, client} = await signedIn();
            const welcomed = client.welcomed();

            browser.lastSocket().deliver(hello("id-Ada", "Ada"));

            expect(await welcomed).toBe(true);
            expect(await client.welcomed()).toBe(true);
        });

        it("says it is not welcomed once the socket closes before the hello", async () => {
            const {browser, client} = await signedIn();
            const welcomed = client.welcomed();

            browser.lastSocket().drop();

            expect(await welcomed).toBe(false);
        });

        it("says it is not welcomed at once when no socket is opening", async () => {
            expect(await new CityClient(new FakeBrowser(server([]))).welcomed()).toBe(false);
        });

        it("tells its city-failed listeners when the server closes the connection because its city failed, before " +
           "going offline", async () => {
            const {browser, client} = await signedIn();
            browser.lastSocket().deliver(hello("id-Ada", "Ada"));
            const onlineWhenTold: boolean[] = [];
            client.onCityFailed(() => onlineWhenTold.push(client.getStatus().online));

            browser.lastSocket().drop(CITY_FAILED_CLOSE);

            expect(onlineWhenTold).toEqual([true]);
            expect(client.getStatus()).toEqual({online: false});
            expect(browser.scheduled).toHaveLength(1);
        });

        it("tells no city-failed listener of any other close", async () => {
            const {browser, client} = await signedIn();
            browser.lastSocket().deliver(hello("id-Ada", "Ada"));
            const told = jest.fn();
            client.onCityFailed(told);

            browser.lastSocket().drop(1000);

            expect(told).not.toHaveBeenCalled();
        });

        it("hands the city's messages to its city listeners, in order", async () => {
            const {browser, client} = await signedIn();
            const received: CityMessage[] = [];
            client.onCityMessage((message) => received.push(message));
            browser.lastSocket().deliver(hello("id-Ada", "Ada"));

            browser.lastSocket().deliver({type: "state", messages: [{type: "population", population: 12}]});
            browser.lastSocket().deliver({type: "answer", id: 0, value: null});
            browser.lastSocket().deliver({type: "failed", id: 1, error: "No city has started"});

            expect(received).toEqual([
                {type: "state", messages: [{type: "population", population: 12}]},
                {type: "answer", id: 0, value: null},
                {type: "failed", id: 1, error: "No city has started"},
            ]);
        });

        it("sends a message once the server has welcomed the socket, and not before or after it closes", async () => {
            const {browser, client} = await signedIn();
            const socket = browser.lastSocket();

            const beforeHello = client.send({type: "save", id: 0});
            socket.deliver(hello("id-Ada", "Ada"));
            const online = client.send({type: "save", id: 1});
            socket.drop();
            const afterClose = client.send({type: "save", id: 2});

            expect([beforeHello, online, afterClose]).toEqual([false, true, false]);
            expect(socket.sent).toEqual(["{\"type\":\"save\",\"id\":1}"]);
        });
    });

    describe("after a drop", () => {

        it("is offline and reconnects after a second with the same token", async () => {
            const browser = new FakeBrowser(server([]));
            const client = new CityClient(browser);
            await client.signIn("Ada");
            browser.lastSocket().deliver(hello("id-1", "Ada"));

            browser.lastSocket().drop();

            expect(client.getStatus()).toEqual({online: false});
            expect(browser.scheduled.map((entry) => entry.delayMs)).toEqual([1000]);

            await browser.runScheduled();

            expect(browser.sockets).toHaveLength(2);
            expect(browser.lastSocket().pathAndQuery).toBe(`${CITY_PATH}?access_token=token-1`);
        });

        it("waits twice as long after each failed attempt, up to 30 seconds, and starts again after a hello", async () => {
            const browser = new FakeBrowser(server([]));
            await new CityClient(browser).signIn("Ada");
            browser.lastSocket().drop();
            browser.handler = noServer;
            const delays: number[] = [];

            for (let i = 0; i < 7; i++) {
                delays.push(browser.scheduled[0].delayMs);
                await browser.runScheduled();
            }

            expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);

            browser.handler = server(["token-1"]);
            await browser.runScheduled();
            browser.lastSocket().deliver(hello("id-1", "Ada"));
            browser.lastSocket().drop();

            expect(browser.scheduled.map((entry) => entry.delayMs)).toEqual([1000]);
        });

        it("signs in again under the same name when the server rejects the token, as a new player", async () => {
            const browser = new FakeBrowser(server([]));
            await new CityClient(browser).signIn("Ada");
            browser.lastSocket().drop();
            browser.handler = server([], "renewed");

            await browser.runScheduled();

            expect(JSON.parse(browser.requests[browser.requests.length - 1].body ?? "")).toEqual({name: "Ada"});
            expect(browser.lastSocket().pathAndQuery).toBe(`${CITY_PATH}?access_token=renewed-1`);
            expect(browser.stored).toEqual({token: "renewed-1", name: "Ada"});
        });

        it.each([
            ["the server has gone", new TypeError("Failed to fetch")],
            ["the server limits sign-ins", refusal(429, {error: "Too many sign-ins from here."})],
        ])("tries again later when the server rejects the token and %s", async (_, signIn) => {
            const browser = new FakeBrowser(server([]));
            await new CityClient(browser).signIn("Ada");
            browser.lastSocket().drop();
            browser.handler = rejectingTokensAndAnswering(signIn);

            await browser.runScheduled();

            expect(browser.scheduled.map((entry) => entry.delayMs)).toEqual([2000]);
        });

        it("stays offline when the server rejects the token and refuses the name, which it would refuse every time", async () => {
            const browser = new FakeBrowser(server([]));
            const client = new CityClient(browser);
            await client.signIn("Ada");
            browser.lastSocket().drop();
            browser.handler = server([], "token", ["Ada"]);

            await browser.runScheduled();

            expect(browser.scheduled).toHaveLength(0);
            expect(browser.sockets).toHaveLength(1);
            expect(client.getStatus()).toEqual({online: false});
        });

        it("uses a newer session another tab stored", async () => {
            const browser = new FakeBrowser(server(["from-another-tab"]));
            const client = new CityClient(browser);
            await client.signIn("Ada");
            browser.stored = {token: "from-another-tab", name: "Ada"};

            browser.lastSocket().drop();
            await browser.runScheduled();

            expect(browser.lastSocket().pathAndQuery).toBe(`${CITY_PATH}?access_token=from-another-tab`);
        });

        it("signs in once for two tabs whose token was rejected together, and both use the new session", async () => {
            const browser = new FakeBrowser(server([]));
            const firstTab = new CityClient(browser);
            await firstTab.signIn("Ada");
            const secondTab = new CityClient(browser);
            expect(await secondTab.start()).toBe("signed-in");
            browser.handler = server([], "renewed");

            browser.sockets.forEach((socket) => socket.drop());
            await browser.runScheduled(2);

            // Ada's own sign-in, then one for both tabs
            expect(browser.signIns()).toHaveLength(2);
            expect(browser.sockets.slice(2).map((socket) => socket.pathAndQuery))
                .toEqual([`${CITY_PATH}?access_token=renewed-1`, `${CITY_PATH}?access_token=renewed-1`]);
        });
    });
});
