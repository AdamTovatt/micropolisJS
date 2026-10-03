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


import { browserCityEnvironment } from "../src/browserCityEnvironment";
import { CITY_PATH, StoredSession } from "../src/cityClient";

// The environment reads the browser's globals, so each test stands in for the ones it needs
const replaced: {name: string; descriptor: PropertyDescriptor | undefined}[] = [];

function stubGlobal(name: string, value: unknown): void {
    replaced.push({name, descriptor: Object.getOwnPropertyDescriptor(globalThis, name)});
    Object.defineProperty(globalThis, name, {value, configurable: true, writable: true});
}

function removeGlobal(name: string): void {
    replaced.push({name, descriptor: Object.getOwnPropertyDescriptor(globalThis, name)});
    delete (globalThis as Record<string, unknown>)[name];
}

// Storage as a browser's, shared by every environment as by every tab
function storage(): Storage {
    const items = new Map<string, string>();
    return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => { items.set(key, value); },
    } as Storage;
}

const ADA: StoredSession = {token: "token-1", name: "Ada"};

describe("the browser's city environment", () => {

    afterEach(() => {
        for (let entry = replaced.pop(); entry !== undefined; entry = replaced.pop()) {
            if (entry.descriptor === undefined) {
                delete (globalThis as Record<string, unknown>)[entry.name];
            } else {
                Object.defineProperty(globalThis, entry.name, entry.descriptor);
            }
        }
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

        it("is shared through storage with every other tab", () => {
            stubGlobal("localStorage", storage());

            browserCityEnvironment().store.save(ADA);

            expect(browserCityEnvironment().store.load()).toEqual(ADA);
        });

        it("is kept for the page when storage refuses to write", () => {
            stubGlobal("localStorage", {getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }});
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
            stubGlobal("localStorage", {getItem: () => text, setItem: () => undefined});

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
