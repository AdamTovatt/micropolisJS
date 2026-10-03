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

// A browser window for modules that read one, such as storage.ts, which reads window.localStorage when it loads. The
// tests run in Node: stub the window, then import the module.

type Global = {window?: unknown};

export interface FakeLocalStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

// Stubs the window, with an empty local storage, and returns the storage
export function stubWindow(): FakeLocalStorage {
    const items = new Map<string, string>();
    const localStorage = {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => {
            items.set(key, String(value));
        },
    };

    (globalThis as Global).window = {localStorage};
    return localStorage;
}

export function removeWindow(): void {
    delete (globalThis as Global).window;
}
