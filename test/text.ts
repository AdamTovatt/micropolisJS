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

import { ADVISOR_SUBJECTS } from "../src/cityStatus";
import * as Messages from "../src/messages";
import { Text } from "../src/text";

const MILESTONES = [
    Messages.REACHED_CAPITAL, Messages.REACHED_CITY, Messages.REACHED_MEGALOPOLIS, Messages.REACHED_METROPOLIS,
    Messages.REACHED_TOWN,
];

// Every subject the game shows: the simulation's advisor conditions, disasters, crashes and milestones, and the
// other events it announces, and the client's own messages
const SHOWN_SUBJECTS = [
    ...ADVISOR_SUBJECTS, ...Messages.DISASTER_MESSAGES, ...Messages.CRASHES, ...MILESTONES, Messages.NO_MONEY,
    Messages.HEAVY_TRAFFIC, Messages.WELCOME, Messages.LOG_UNCHECKED, Messages.BUDGET_REVIEW_DUE,
];

function subjectsWithTone(tone: string): string[] {
    return Object.keys(Text.messages).filter((subject) => Text.messages[subject].tone === tone);
}

describe("the messages' text", () => {

    it.each(SHOWN_SUBJECTS)("has an entry for %s", (subject) => {
        expect(Object.prototype.hasOwnProperty.call(Text.messages, subject)).toBe(true);
    });

    it.each(Object.keys(Text.messages))("has words for %s", (subject) => {
        expect(Text.messages[subject].text.trim()).not.toBe("");
    });

    // A milestone shows even over a recent disaster, so no other message may be good news
    it("is good news for the milestones alone", () => {
        expect(subjectsWithTone("good").sort()).toEqual([...MILESTONES].sort());
    });

    // A disaster holds off neutral news for a while, which the game times only from bad news
    it.each([...Messages.DISASTER_MESSAGES, ...Messages.CRASHES])("is bad news for %s", (subject) => {
        expect(Text.messages[subject].tone).toBe("bad");
    });
});
