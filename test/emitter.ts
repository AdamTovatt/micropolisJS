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

// The events the test announces: one carrying a string, one a number, and one carrying nothing
interface Events {
    closed: string;
    counted: number;
    opened: undefined;
}

// An emitter whose events the test announces
class Announcer extends Emitter<Events> {
    close(value: string): void {
        this.emit("closed", value);
    }

    count(value: number): void {
        this.emit("counted", value);
    }

    open(): void {
        this.emit("opened");
    }
}

describe("a client emitter", () => {

    it("delivers an event to the listeners added for it, in the order they were added", () => {
        const announcer = new Announcer();
        const heard: string[] = [];
        announcer.addEventListener("closed", (value) => heard.push(`first ${value}`));
        announcer.addEventListener("closed", (value) => heard.push(`second ${value}`));
        announcer.addEventListener("opened", () => heard.push("opened"));

        announcer.close("OK");

        expect(heard).toEqual(["first OK", "second OK"]);
    });

    it("delivers an event that carries nothing with no value", () => {
        const announcer = new Announcer();
        const listener = jest.fn();
        announcer.addEventListener("opened", listener);

        announcer.open();

        expect(listener).toHaveBeenCalledWith(undefined);
    });

    it("calls a listener added twice once", () => {
        const announcer = new Announcer();
        const listener = jest.fn();
        announcer.addEventListener("opened", listener);
        announcer.addEventListener("opened", listener);

        announcer.open();

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("delivers an instance's events only to that instance's listeners", () => {
        const first = new Announcer();
        const second = new Announcer();
        const heardByFirst = jest.fn();
        first.addEventListener("counted", heardByFirst);

        second.count(42);

        expect(heardByFirst).not.toHaveBeenCalled();
    });

    // Checked by the compiler, which npm run typecheck and the build run over the tests: a listener that takes another
    // type than its event carries doesn't compile, nor an event of no name the emitter has
    it("types each listener by what its event carries", () => {
        const announcer = new Announcer();
        // @ts-expect-error: "counted" carries a number, not a string
        announcer.addEventListener("counted", (value: string) => value);
        // @ts-expect-error: no event is named "shut"
        announcer.addEventListener("shut", () => undefined);

        expect(announcer).toBeInstanceOf(Emitter);
    });

    // Checked by the compiler, as above: an emit of another type than its event carries doesn't compile, nor one that
    // leaves out a value its event carries, nor one that gives a value to an event that carries none
    it("types each emit by what its event carries", () => {
        class WrongAnnouncer extends Emitter<Events> {
            announce(): void {
                // @ts-expect-error: "closed" carries a string
                this.emit("closed", 42);
                // @ts-expect-error: "closed" carries a value
                this.emit("closed");
                // @ts-expect-error: "opened" carries nothing
                this.emit("opened", "now");
            }
        }

        expect(new WrongAnnouncer()).toBeInstanceOf(Emitter);
    });
});
