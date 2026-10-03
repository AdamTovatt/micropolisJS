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
import type { TrackableSprite } from "../src/monsterTV";
import { NewsHold, routeMessage } from "../src/news";

const SECOND = 1000;
const HOLD = 20 * SECOND;

describe("news held after a disaster", () => {

    it("shows every tone while no disaster has been reported", () => {
        const hold = new NewsHold();

        expect([hold.shows("neutral", false, 0), hold.shows("bad", false, 0), hold.shows("good", false, 0)])
            .toEqual([true, true, true]);
    });

    it("holds neutral news for 20 seconds after a disaster, then shows it", () => {
        const hold = new NewsHold();

        hold.shows("bad", true, 0);

        expect([hold.shows("neutral", false, HOLD), hold.shows("neutral", false, HOLD + 1)]).toEqual([false, true]);
    });

    it("starts the hold again at each disaster, but not at other bad news", () => {
        const hold = new NewsHold();

        hold.shows("bad", true, 0);
        hold.shows("bad", true, 15 * SECOND);
        hold.shows("bad", false, 30 * SECOND);

        expect([hold.shows("neutral", false, 15 * SECOND + HOLD), hold.shows("neutral", false, 15 * SECOND + HOLD + 1)])
            .toEqual([false, true]);
    });

    it("shows good news and bad news over a recent disaster", () => {
        const hold = new NewsHold();

        hold.shows("bad", true, 0);

        expect([hold.shows("good", false, SECOND), hold.shows("bad", false, SECOND)]).toEqual([true, true]);
    });
});

describe("where a message goes", () => {

    const sprite: TrackableSprite = {addEventListener: () => {}, removeEventListener: () => {}};

    it("announces good news without the monster TV, even about a place", () => {
        const route = routeMessage({subject: Messages.REACHED_TOWN, data: {x: 1, y: 2, showable: true}},
                                   new NewsHold(), 0);

        expect(route).toEqual({notify: true, tv: null, unknown: false});
    });

    it("shows a place the message says the TV can show", () => {
        const data = {x: 1, y: 2, showable: true} as const;

        expect(routeMessage({subject: Messages.FIRE_REPORTED, data}, new NewsHold(), 0))
            .toEqual({notify: true, tv: data, unknown: false});
    });

    it("follows a sprite the message says the TV can follow", () => {
        const data = {x: 1, y: 2, trackable: true, sprite} as const;

        expect(routeMessage({subject: Messages.MONSTER_SIGHTED, data}, new NewsHold(), 0).tv).toBe(data);
    });

    it("leaves the TV as it is for a place it can neither show nor follow", () => {
        expect(routeMessage({subject: Messages.HIGH_POLLUTION, data: {x: 1, y: 2}}, new NewsHold(), 0).tv).toBeNull();
    });

    it("holds neutral news back after a disaster's message", () => {
        const hold = new NewsHold();

        routeMessage({subject: Messages.FIRE_REPORTED, data: {x: 1, y: 2, showable: true}}, hold, 0);

        expect(routeMessage({subject: Messages.NEED_STADIUM}, hold, SECOND).notify).toBe(false);
    });

    it("announces nothing for a subject there is no text for, but still shows its place", () => {
        const data = {x: 1, y: 2, showable: true} as const;

        expect(routeMessage({subject: "noSuchSubject", data}, new NewsHold(), 0))
            .toEqual({notify: false, tv: data, unknown: true});
    });
});
