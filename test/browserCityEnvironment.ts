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


import { browserCityEnvironment, SESSION_STORAGE_KEY } from "../src/browserCityEnvironment";
import { CITY_PATH, StoredSession } from "../src/cityClient";
import { FakeStore } from "./helpers/fakeStore";
import { removeGlobal, restoreGlobals, stubGlobal } from "./helpers/globals";

// The environment reads the browser's globals, so each test stands in for the ones it needs
const ADA: StoredSession = {token: "token-1", name: "Ada"};

describe("the browser's city environment", () => {

    afterEach(() => {
        restoreGlobals();
    });

    it("gives up on a request the server never answers", async () => {
        // Ends only when its signal aborts, as fetch does with no answer
        stubGlobal("fetch", (_: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }));

        await expect(browserCityEnvironment(20).request("/api/session", {method: "GET", headers: {}}))
            .rejects.toHaveProperty("name", "TimeoutError");
    });

    describe("the stored session", () => {

        // Storage as a browser's, shared by every environment as by every tab
        it("is shared through storage with every other tab", () => {
            stubGlobal("localStorage", new FakeStore());

            browserCityEnvironment().store.save(ADA);

            expect(browserCityEnvironment().store.load()).toEqual(ADA);
        });

        it("is kept for the page when storage refuses to write", () => {
            const refusing = new FakeStore();
            refusing.failsToWrite = true;
            stubGlobal("localStorage", refusing);
            const environment = browserCityEnvironment();

            environment.store.save(ADA);

            expect(environment.store.load()).toEqual(ADA);
        });

        it("is kept for the page when there is no storage", () => {
            removeGlobal("localStorage");
            const environment = browserCityEnvironment();

            environment.store.save(ADA);

            expect(environment.store.load()).toEqual(ADA);
        });

        it.each([
            ["text that is not JSON", "{\"token\":"],
            ["a session without its name", "{\"token\":\"token-1\"}"],
            ["a token that is not text", "{\"token\":1,\"name\":\"Ada\"}"],
        ])("is none when storage holds %s", (_, text) => {
            const holding = new FakeStore();
            holding.items.set(SESSION_STORAGE_KEY, text);
            stubGlobal("localStorage", holding);

            expect(browserCityEnvironment().store.load()).toBeNull();
        });
    });

    it.each([
        ["http:", "ws:"],
        ["https:", "wss:"],
    ])("opens the city's socket on a page served over %s with %s", (protocol, scheme) => {
        const urls: string[] = [];
        stubGlobal("location", {protocol, host: "city.example:5180"});
        stubGlobal("WebSocket", class {
            constructor(url: string) {
                urls.push(url);
            }
        });

        browserCityEnvironment().openSocket(`${CITY_PATH}?access_token=t`);

        expect(urls).toEqual([`${scheme}//city.example:5180${CITY_PATH}?access_token=t`]);
    });

    it("runs a task under the browser's lock when it has one", async () => {
        const locks: string[] = [];
        stubGlobal("navigator", {locks: {request: (name: string, task: () => Promise<unknown>) => { locks.push(name); return task(); }}});

        expect(await browserCityEnvironment().exclusively(() => Promise.resolve(7))).toBe(7);
        expect(locks).toHaveLength(1);
    });

    it("runs a task at once when the browser has no locks, as outside a secure context", async () => {
        stubGlobal("navigator", {});

        expect(await browserCityEnvironment().exclusively(() => Promise.resolve(7))).toBe(7);
    });
});
