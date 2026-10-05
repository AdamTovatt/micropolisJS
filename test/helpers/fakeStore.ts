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

import type { PageStore } from "../../src/storage";

// A store of strings by key, as the browser's localStorage is, which a test can make fail as a full or disabled one
// does: reading, writing, or both
export class FakeStore implements PageStore {
    readonly items = new Map<string, string>();
    failsToRead = false;
    failsToWrite = false;

    // Fails both ways
    set failing(failing: boolean) {
        this.failsToRead = failing;
        this.failsToWrite = failing;
    }

    getItem(key: string): string | null {
        if (this.failsToRead) {
            throw new Error("The store can't be read");
        }

        return this.items.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.failIfWriteFails();
        this.items.set(key, String(value));
    }

    removeItem(key: string): void {
        this.failIfWriteFails();
        this.items.delete(key);
    }

    private failIfWriteFails(): void {
        if (this.failsToWrite) {
            throw new Error("The store can't be written");
        }
    }
}
