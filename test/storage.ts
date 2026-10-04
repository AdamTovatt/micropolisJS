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

import { CITY_LIST_KEY, CityList, pageStore, StoredText } from "../src/storage";
import { FakeStore } from "./helpers/fakeStore";

const KEY = "micropolisJSTest";
const ADA = {city: "0123456789abcdef0123456789abcdef", name: "Adaville"};
const BOB = {city: "fedcba9876543210fedcba9876543210", name: "Bobtown"};

describe("the page's store", () => {

    afterEach(() => {
        delete (globalThis as Record<string, unknown>).localStorage;
    });

    it("is the browser's localStorage", () => {
        const localStorage = new FakeStore();
        Object.defineProperty(globalThis, "localStorage", {value: localStorage, configurable: true});

        expect(pageStore()).toBe(localStorage);
    });

    // As a browser that blocks the page's storage throws when it is touched
    it("is none where touching the browser's localStorage throws", () => {
        Object.defineProperty(globalThis, "localStorage", {
            get: () => { throw new Error("SecurityError"); },
            configurable: true,
        });

        expect(pageStore()).toBeNull();
    });

    it("is none where the browser has no localStorage", () => {
        expect(pageStore()).toBeNull();
    });
});

describe("text kept in the store", () => {

    it("is none at first", () => {
        expect(new StoredText(new FakeStore(), KEY).read()).toBeNull();
    });

    it("is written under its key, and read back from the store by another page", () => {
        const store = new FakeStore();

        new StoredText(store, KEY).write("kept");

        expect([store.items.get(KEY), new StoredText(store, KEY).read()]).toEqual(["kept", "kept"]);
    });

    it("is read from the store each time, so the browser's tabs share it", () => {
        const store = new FakeStore();
        const text = new StoredText(store, KEY);
        text.write("mine");

        new StoredText(store, KEY).write("the other tab's");

        expect(text.read()).toBe("the other tab's");
    });

    it("is gone from the store once removed", () => {
        const store = new FakeStore();
        const text = new StoredText(store, KEY);
        text.write("kept");

        text.remove();

        expect([store.items.has(KEY), text.read()]).toEqual([false, null]);
    });

    it("is held for the page where there is no store", () => {
        const text = new StoredText(null, KEY);

        text.write("held");
        const written = text.read();
        text.remove();

        expect([written, text.read()]).toEqual(["held", null]);
    });

    it("is held as the page last read it while the store can't be read", () => {
        const store = new FakeStore();
        store.items.set(KEY, "read");
        const text = new StoredText(store, KEY);
        text.read();
        store.failsToRead = true;

        expect(text.read()).toBe("read");
    });

    // Rather than what the store still has, which the page's write never reached
    it.each([
        ["written", (text: StoredText) => text.write("held"), "held"],
        ["removed", (text: StoredText) => text.remove(), null],
    ])("is held as the page %s it when the store can't be written", (_, change, held) => {
        const store = new FakeStore();
        store.items.set(KEY, "stale");
        const text = new StoredText(store, KEY);
        store.failsToWrite = true;

        change(text);

        expect([text.read(), store.items.get(KEY)]).toEqual([held, "stale"]);
    });

    it("is read from the store again once a write reaches it", () => {
        const store = new FakeStore();
        const text = new StoredText(store, KEY);
        store.failsToWrite = true;
        text.write("held");
        store.failsToWrite = false;
        text.write("kept");

        new StoredText(store, KEY).write("the other tab's");

        expect(text.read()).toBe("the other tab's");
    });
});

describe("the list of cities this browser played", () => {

    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
    });

    // A store holding the text as the list
    function holding(text: string): FakeStore {
        const store = new FakeStore();
        store.items.set(CITY_LIST_KEY, text);
        return store;
    }

    it("is empty at first", () => {
        expect(new CityList(new FakeStore()).cities()).toEqual([]);
        expect(warn).not.toHaveBeenCalled();
    });

    it("lists the city played last first", () => {
        const list = new CityList(new FakeStore());

        list.remember(ADA);
        list.remember(BOB);

        expect(list.cities()).toEqual([BOB, ADA]);
    });

    it("moves a city played again to the top, under the name it gives, once", () => {
        const list = new CityList(new FakeStore());

        list.remember(ADA);
        list.remember(BOB);
        list.remember({...ADA, name: "Ada City"});

        expect(list.cities()).toEqual([{...ADA, name: "Ada City"}, BOB]);
    });

    it("forgets a city by its id", () => {
        const list = new CityList(new FakeStore());
        list.remember(ADA);
        list.remember(BOB);

        list.forget(BOB.city);

        expect(list.cities()).toEqual([ADA]);
    });

    it("keeps only the id and the name of a city", () => {
        const store = new FakeStore();

        new CityList(store).remember({...ADA, seed: 7} as typeof ADA);

        expect(JSON.parse(store.items.get(CITY_LIST_KEY)!)).toEqual([ADA]);
    });

    it("is shared by the browser's tabs", () => {
        const store = new FakeStore();
        const tab = new CityList(store);

        tab.remember(ADA);
        new CityList(store).remember(BOB);

        expect(tab.cities()).toEqual([BOB, ADA]);
    });

    it("starts again from a stored list that isn't one, and says so", () => {
        const stored = JSON.stringify([ADA, {city: "not an id", name: "Nowhere"}]);
        const list = new CityList(holding(stored));

        const cities = list.cities();
        list.remember(BOB);

        expect([cities, list.cities()]).toEqual([[], [BOB]]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(stored));
    });

    it.each([
        ["text that isn't JSON", "["],
        ["an object", JSON.stringify(ADA)],
        ["an entry with no name", JSON.stringify([{city: ADA.city}])],
    ])("is not read from %s, which is said", (_, text) => {
        expect(new CityList(holding(text)).cities()).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(text));
    });

    it.each([
        ["remembered", (list: CityList) => list.remember(BOB), [BOB, ADA]],
        ["forgotten", (list: CityList) => list.forget(ADA.city), []],
    ])("is held for the page as a city is %s while the store fails", (_, change, cities) => {
        const store = new FakeStore();
        const list = new CityList(store);
        list.remember(ADA);
        store.failing = true;

        change(list);

        expect(list.cities()).toEqual(cities);
    });
});
