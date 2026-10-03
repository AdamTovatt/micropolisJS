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

import { EventEmitter } from "../src/eventEmitter.js";

interface Emitter {
    addEventListener(event: string, listener: (value: unknown) => void): void;
    removeEventListener(event: string, listener: (value: unknown) => void): void;
    _emitEvent(event: string, value?: unknown): void;
}

const EVENT = "SOMETHING_HAPPENED";

function makeEmitterConstructor(): new () => Emitter {
    return EventEmitter(function() { /* An emitter with no state of its own */ });
}

describe("an event emitter", () => {

    describe("decorating a constructor", () => {

        it("should deliver an instance's events only to that instance's listeners", () => {
            const Emitter = makeEmitterConstructor();
            const first = new Emitter();
            const second = new Emitter();
            const heardByFirst = jest.fn();
            const heardBySecond = jest.fn();
            first.addEventListener(EVENT, heardByFirst);
            second.addEventListener(EVENT, heardBySecond);

            second._emitEvent(EVENT, 42);

            expect(heardByFirst).not.toHaveBeenCalled();
            expect(heardBySecond).toHaveBeenCalledWith(42);
        });

        it("should remove a listener from its own instance only", () => {
            const Emitter = makeEmitterConstructor();
            const first = new Emitter();
            const second = new Emitter();
            const listener = jest.fn();
            first.addEventListener(EVENT, listener);
            second.addEventListener(EVENT, listener);

            first.removeEventListener(EVENT, listener);
            second._emitEvent(EVENT);

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe("decorating an object", () => {

        it("should deliver its events to its listeners, once each", () => {
            const emitter = EventEmitter({}) as Emitter;
            const listener = jest.fn();
            emitter.addEventListener(EVENT, listener);
            emitter.addEventListener(EVENT, listener);

            emitter._emitEvent(EVENT, "value");

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith("value");
        });
    });
});
