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

// An event is known by its string alone: a listener, a front-end message's subject and a unit snapshot's record of the
// events emitted all name it so. Two names sharing one string would be one event.
describe("the event names", () => {

    it("are each a different string", () => {
        const names = Object.entries(Messages).filter(([, value]) => typeof value === "string");
        const byString = new Map<unknown, string[]>();

        for (const [name, value] of names) {
            byString.set(value, [...(byString.get(value) ?? []), name]);
        }

        const shared = Array.from(byString.values()).filter((sharing) => sharing.length > 1);

        expect(names.length).toBeGreaterThan(0);
        expect(shared).toEqual([]);
    });
});
