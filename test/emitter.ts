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

import { Emitter } from "../src/emitter";

// An emitter whose events the test announces
class Announcer extends Emitter {
    announce(event: string, value?: unknown): void {
        this.emit(event, value);
    }
}

describe("a client emitter", () => {

    it("delivers an event to the listeners added for it, in the order they were added", () => {
        const announcer = new Announcer();
        const heard: string[] = [];
        announcer.addEventListener("closed", (value: string) => heard.push(`first ${value}`));
        announcer.addEventListener("closed", (value: string) => heard.push(`second ${value}`));
        announcer.addEventListener("opened", () => heard.push("opened"));

        announcer.announce("closed", "OK");

        expect(heard).toEqual(["first OK", "second OK"]);
    });

    it("calls a listener added twice once", () => {
        const announcer = new Announcer();
        const listener = jest.fn();
        announcer.addEventListener("closed", listener);
        announcer.addEventListener("closed", listener);

        announcer.announce("closed");

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("delivers an instance's events only to that instance's listeners", () => {
        const first = new Announcer();
        const second = new Announcer();
        const heardByFirst = jest.fn();
        first.addEventListener("closed", heardByFirst);

        second.announce("closed", 42);

        expect(heardByFirst).not.toHaveBeenCalled();
    });
});
