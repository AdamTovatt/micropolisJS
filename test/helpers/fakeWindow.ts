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

import type { GameWindow } from "../../src/windowBase";

// A game window that records what it was opened with, and closes with the choice the test gives it, or as cancelled,
// as Escape closes a window
export class FakeWindow<Args extends unknown[], Choice> implements GameWindow<Args, Choice> {
    readonly opened: Args[] = [];
    private closed: ((choice: Choice) => void) | null = null;

    constructor(private readonly cancelled: Choice) {}

    get showing(): boolean {
        return this.closed !== null;
    }

    open(closed: (choice: Choice) => void, ...args: Args): void {
        this.opened.push(args);
        this.closed = closed;
    }

    close(): void {
        this.choose(this.cancelled);
    }

    // The player closes the window with the choice
    choose(choice: Choice): void {
        const closed = this.closed;
        if (closed === null) {
            throw new Error("The window isn't showing");
        }

        this.closed = null;
        closed(choice);
    }
}
