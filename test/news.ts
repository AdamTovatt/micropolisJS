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
import { NewsHold, routeMessage } from "../src/news";
import { SPRITE_MONSTER } from "../src/spriteConstants";

const SECOND = 1000;
const HOLD = 20 * SECOND;

// A message of each tone, and a disaster's, whose tone is bad
const neutral = (hold: NewsHold, now: number) => hold.shows(Messages.NEED_STADIUM, "neutral", now);
const bad = (hold: NewsHold, now: number) => hold.shows(Messages.HIGH_CRIME, "bad", now);
const good = (hold: NewsHold, now: number) => hold.shows(Messages.REACHED_TOWN, "good", now);
const disaster = (hold: NewsHold, now: number) => hold.shows(Messages.FIRE_REPORTED, "bad", now);
const explosion = (hold: NewsHold, now: number) => hold.shows(Messages.EXPLOSION_REPORTED, "bad", now);

describe("news held after a disaster", () => {

    it("shows every tone while no disaster has been reported", () => {
        const hold = new NewsHold();

        expect([neutral(hold, 0), bad(hold, 0), good(hold, 0)]).toEqual([true, true, true]);
    });

    it("holds neutral news for 20 seconds after a disaster, then shows it", () => {
        const hold = new NewsHold();

        disaster(hold, 0);

        expect([neutral(hold, HOLD), neutral(hold, HOLD + 1)]).toEqual([false, true]);
    });

    it("starts the hold again at each disaster, but not at other bad news", () => {
        const hold = new NewsHold();

        disaster(hold, 0);
        disaster(hold, 15 * SECOND);
        bad(hold, 30 * SECOND);

        expect([neutral(hold, 15 * SECOND + HOLD), neutral(hold, 15 * SECOND + HOLD + 1)]).toEqual([false, true]);
    });

    it("shows good news and bad news over a recent disaster", () => {
        const hold = new NewsHold();

        disaster(hold, 0);

        expect([good(hold, SECOND), bad(hold, SECOND)]).toEqual([true, true]);
    });
});

// A crash and a meltdown end in explosions, whose reports would replace their news
describe("an explosion's report", () => {

    it.each([
        ["a crash", Messages.PLANE_CRASHED],
        ["another disaster", Messages.NUCLEAR_MELTDOWN],
    ])("waits 20 seconds behind %s's news, then shows", (_, subject) => {
        const hold = new NewsHold();

        hold.shows(subject, "bad", 0);

        expect([explosion(hold, HOLD), explosion(hold, HOLD + 1)]).toEqual([false, true]);
    });

    it("shows when nothing else is recent, and holds neutral news as a disaster's does", () => {
        const hold = new NewsHold();

        expect([explosion(hold, 0), explosion(hold, SECOND), neutral(hold, HOLD)]).toEqual([true, true, false]);
    });

    it("starts no hold while it waits", () => {
        const hold = new NewsHold();
        disaster(hold, 0);

        explosion(hold, HOLD);

        expect(neutral(hold, HOLD + 1)).toBe(true);
    });

    it("holds neither crash news nor bad news", () => {
        const hold = new NewsHold();
        explosion(hold, 0);

        expect([hold.shows(Messages.PLANE_CRASHED, "bad", SECOND), bad(hold, SECOND)]).toEqual([true, true]);
    });
});

describe("where a message goes", () => {

    const sprite = SPRITE_MONSTER;

    it("announces good news without the monster TV, even about a place", () => {
        const route = routeMessage({type: "news", subject: Messages.REACHED_TOWN, data: {x: 1, y: 2, showable: true}},
                                   new NewsHold(), 0);

        expect(route).toEqual({notify: true, tv: null, unknown: false});
    });

    it("shows a place the message says the TV can show", () => {
        const data = {x: 1, y: 2, showable: true} as const;

        expect(routeMessage({type: "news", subject: Messages.FIRE_REPORTED, data}, new NewsHold(), 0))
            .toEqual({notify: true, tv: data, unknown: false});
    });

    it("follows a sprite the message says the TV can follow", () => {
        const data = {x: 1, y: 2, trackable: true, sprite} as const;

        expect(routeMessage({type: "news", subject: Messages.MONSTER_SIGHTED, data}, new NewsHold(), 0).tv).toBe(data);
    });

    it("leaves the TV as it is for a place it can neither show nor follow", () => {
        expect(routeMessage({type: "news", subject: Messages.HIGH_POLLUTION, data: {x: 1, y: 2}}, new NewsHold(), 0).tv).toBeNull();
    });

    it("holds neutral news back after a disaster's message", () => {
        const hold = new NewsHold();

        routeMessage({type: "news", subject: Messages.FIRE_REPORTED, data: {x: 1, y: 2, showable: true}}, hold, 0);

        expect(routeMessage({type: "news", subject: Messages.NEED_STADIUM}, hold, SECOND).notify).toBe(false);
    });

    it("leaves a crash's news on the bar when its explosion is reported", () => {
        const hold = new NewsHold();

        const crash = routeMessage({type: "news", subject: Messages.PLANE_CRASHED, data: {x: 5, y: 6, showable: true}},
                                   hold, 0);
        const report = routeMessage({type: "news", subject: Messages.EXPLOSION_REPORTED, data: {x: 5, y: 5}}, hold, 33);

        expect([crash.notify, report]).toEqual([true, {notify: false, tv: null, unknown: false}]);
    });

    it("announces nothing for a subject there is no text for, but still shows its place", () => {
        const data = {x: 1, y: 2, showable: true} as const;

        expect(routeMessage({type: "news", subject: "noSuchSubject", data}, new NewsHold(), 0))
            .toEqual({notify: false, tv: data, unknown: true});
    });
});
