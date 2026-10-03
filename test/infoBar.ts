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

import { dateText, InfoBar, InfoBarElements, InfoSource } from "../src/infoBar";
import * as Messages from "../src/messages";

describe("the info bar's date", () => {

    it.each([[0, 1900, "Jan 1900"], [11, 1902, "Dec 1902"]])("shows month %i of %i as %s", (month, year, text) => {
        expect(dateText({month, year})).toBe(text);
    });
});

describe("the info bar", () => {

    // An info bar on elements of its own, following a source that sends each event to its listener
    function infoBar() {
        const elements: InfoBarElements = {
            classification: {textContent: ""}, population: {textContent: ""}, score: {textContent: ""},
            funds: {textContent: ""}, date: {textContent: ""}, name: {textContent: ""},
        };
        const listeners = new Map<string, (value: never) => void>();
        const source: InfoSource = {
            addEventListener: (event: string, listener: (value: never) => void) => {
                listeners.set(event, listener);
            },
        };

        new InfoBar(elements, source, {classification: "VILLAGE", population: 0, score: 500, funds: 20000,
                                       date: {month: 0, year: 1900}, name: "Town"});

        const send = (event: string, value: unknown) => (listeners.get(event) as (value: unknown) => void)(value);
        const shown = () => Object.fromEntries(Object.entries(elements).map(([key, e]) => [key, e.textContent]));
        return {send, shown};
    }

    it("shows each starting value in its own element", () => {
        expect(infoBar().shown()).toEqual({classification: "VILLAGE", population: "0", score: "500", funds: "20000",
                                           date: "Jan 1900", name: "Town"});
    });

    it("shows each figure the source sends in its own element", () => {
        const {send, shown} = infoBar();

        send(Messages.CLASSIFICATION_UPDATED, "TOWN");
        send(Messages.POPULATION_UPDATED, 2400);
        send(Messages.SCORE_UPDATED, 612);
        send(Messages.FUNDS_CHANGED, 18750);
        send(Messages.DATE_UPDATED, {month: 3, year: 1901});

        expect(shown()).toEqual({classification: "TOWN", population: "2400", score: "612", funds: "18750",
                                 date: "Apr 1901", name: "Town"});
    });
});
