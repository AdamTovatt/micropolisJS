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

import { readdirSync } from "fs";

import * as Messages from "../src/messages";
import { Text } from "../src/text";
import * as UiMessages from "../src/uiMessages";
import { repositoryJson, repositoryPath } from "./helpers/repository";
import { RULES } from "./helpers/ruleConstants";

// The advisor conditions a status record lists, as the C# rules give them
const ADVISOR_SUBJECTS = RULES.advisorConditions;

const MILESTONES = [
    Messages.REACHED_CAPITAL, Messages.REACHED_CITY, Messages.REACHED_MEGALOPOLIS, Messages.REACHED_METROPOLIS,
    Messages.REACHED_TOWN,
];

// Every subject the game shows: the simulation's advisor conditions, disasters, crashes and milestones, and the
// other events it announces, and the client's own messages
const SHOWN_SUBJECTS = [
    ...ADVISOR_SUBJECTS, ...Messages.DISASTER_MESSAGES, ...Messages.CRASHES, ...MILESTONES, Messages.NO_MONEY,
    Messages.HEAVY_TRAFFIC, UiMessages.WELCOME, Messages.BUDGET_REVIEW_DUE,
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

// The subjects of the news whose place the rules give the disaster view to show, in every event the fixture tool
// recorded from them
function subjectsShownOnTv(): string[] {
    const events = readdirSync(repositoryPath("conformance/events")).flatMap((file) =>
        repositoryJson<{events: {payload: unknown}[]}>(`conformance/events/${file}`).events);
    const subjects = events.flatMap(({payload}) => {
        const news = payload as {type?: string, subject?: string, data?: {showable?: boolean, trackable?: boolean}};
        return news?.type === "news" && (news.data?.showable === true || news.data?.trackable === true) ?
            [news.subject!] : [];
    });
    return Array.from(new Set(subjects));
}

describe("the disaster view's titles", () => {

    // So the test below can't pass by finding no news shown on the view
    it("are found for news the rules show on the view", () => {
        expect(subjectsShownOnTv().length).toBeGreaterThan(1);
    });

    it.each([...Messages.DISASTER_MESSAGES, ...Messages.CRASHES, Messages.HEAVY_TRAFFIC, ...subjectsShownOnTv()])(
        "name %s", (subject) => {
        expect(Text.tvTitles[subject]?.trim()).toBeTruthy();
    });
});
