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

import * as Messages from "../src/messages";
import * as UiMessages from "../src/uiMessages";

// The names, with their strings, of the modules' exports that are strings
function stringNames(module: object): [string, unknown][] {
    return Object.entries(module).filter(([, value]) => typeof value === "string");
}

// Each string that more than one name has, with the names that share it
function shared(names: [string, unknown][]): string[][] {
    const byString = new Map<unknown, string[]>();

    for (const [name, value] of names) {
        byString.set(value, [...(byString.get(value) ?? []), name]);
    }

    return Array.from(byString.values()).filter((sharing) => sharing.length > 1);
}

// An event is known by its string alone: a listener, a front-end message's subject and a unit snapshot's record of the
// events emitted all name it so. Two names sharing one string would be one event. The client's own notices are shown
// by their subjects as the city's news is, so the client's names share no string with the city's either.
describe("the event names", () => {

    it("are each a different string, the city's and the client's", () => {
        const names = [...stringNames(Messages), ...stringNames(UiMessages).map(([name, value]): [string, unknown] =>
            [`UiMessages.${name}`, value])];

        expect(stringNames(Messages).length).toBeGreaterThan(0);
        expect(stringNames(UiMessages).length).toBeGreaterThan(0);
        expect(shared(names)).toEqual([]);
    });

    it("can be found to share a string", () => {
        expect(shared([["FIRE", "fire"], ["FLOOD", "flood"], ["BLAZE", "fire"]])).toEqual([["FIRE", "BLAZE"]]);
    });
});
