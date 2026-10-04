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

// The browser's globals a test stands in for, such as localStorage or fetch, which the tests run in Node without. A
// test stubs or removes the ones it needs, and restores them all as it ends.

const replaced: {name: string; descriptor: PropertyDescriptor | undefined}[] = [];

export function stubGlobal(name: string, value: unknown): void {
    replaced.push({name, descriptor: Object.getOwnPropertyDescriptor(globalThis, name)});
    Object.defineProperty(globalThis, name, {value, configurable: true, writable: true});
}

export function removeGlobal(name: string): void {
    replaced.push({name, descriptor: Object.getOwnPropertyDescriptor(globalThis, name)});
    delete (globalThis as Record<string, unknown>)[name];
}

// Puts back every global stubbed or removed, latest first
export function restoreGlobals(): void {
    for (let entry = replaced.pop(); entry !== undefined; entry = replaced.pop()) {
        if (entry.descriptor === undefined) {
            delete (globalThis as Record<string, unknown>)[entry.name];
        } else {
            Object.defineProperty(globalThis, entry.name, entry.descriptor);
        }
    }
}
