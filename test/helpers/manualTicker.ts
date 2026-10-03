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

import type { Ticker } from "../../src/cityHost";

// A city host's loop run by hand: run takes one turn of it, after moving the clock on by the milliseconds given
export class ManualTicker implements Ticker {
    private time = 0;
    private callbacks: (() => void)[] = [];

    now(): number {
        return this.time;
    }

    later(callback: () => void): void {
        this.callbacks.push(callback);
    }

    run(milliseconds = 0): void {
        this.time += milliseconds;
        const callbacks = this.callbacks;
        this.callbacks = [];
        callbacks.forEach((callback) => callback());
    }
}
