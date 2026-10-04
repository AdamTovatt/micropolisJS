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

import { joinLinkedCity, leaveLostCity, linkedCity, linkToCity, PageWindow, ServerCity } from "../src/cityLink";

const CITY = "0123456789abcdef0123456789abcdef";

// A page at the address given, which records what it shows and where it goes
class FakePage implements PageWindow {
    readonly alerts: string[] = [];
    readonly assigned: string[] = [];
    readonly replaced: {data: unknown, url: string}[] = [];

    readonly location = {href: "", assign: (url: string) => this.assigned.push(url)};
    readonly history = {
        state: {entry: 1} as unknown,
        replaceState: (data: unknown, _unused: string, url: string) => this.replaced.push({data, url}),
    };

    constructor(href: string) {
        this.location.href = href;
    }

    alert(message: string): void {
        this.alerts.push(message);
    }
}

describe("a city's link", () => {

    const started: ServerCity = {name: "Town", seed: 2026, city: CITY};

    it("joins the city it names and plays it", async () => {
        const page = new FakePage(`http://localhost:44903/?city=${CITY}`);
        const played: ServerCity[] = [];
        const joined: string[] = [];

        const result = await joinLinkedCity(CITY, {join: async (city) => {
            joined.push(city);
            return started;
        }}, (city) => played.push(city), page);

        expect(result).toBe(true);
        expect(joined).toEqual([CITY]);
        expect(played).toEqual([started]);
        expect(page.alerts).toEqual([]);
    });

    it("says why the server refused the join, in its words, and plays nothing", async () => {
        const page = new FakePage(`http://localhost:44903/?city=${CITY}`);
        const play = jest.fn();

        const result = await joinLinkedCity(CITY, {join: () => Promise.reject(new Error("No city has the id"))}, play,
                                            page);

        expect(result).toBe(false);
        expect(page.alerts).toEqual(["The city in this link can't be joined: No city has the id"]);
        expect(play).not.toHaveBeenCalled();
        expect(page.replaced).toEqual([{data: {entry: 1}, url: "http://localhost:44903/"}]);
    });

    it("is read from the page's address", () => {
        const page = new FakePage(`http://localhost:44903/?debug=1&city=${CITY}`);

        expect(linkedCity(page)).toBe(CITY);
        expect(page.alerts).toEqual([]);
        expect(page.replaced).toEqual([]);
    });

    it("is none when the address names no city", () => {
        expect(linkedCity(new FakePage("http://localhost:44903/?debug=1"))).toBeNull();
    });

    it("that isn't a city's id is said out loud and taken out of the address", () => {
        const page = new FakePage("http://localhost:44903/?debug=1&city=nope");

        expect(linkedCity(page)).toBeNull();
        expect(page.alerts).toEqual(["?city must be a city's id, 32 hexadecimal digits, got \"nope\""]);
        expect(page.replaced).toEqual([{data: {entry: 1}, url: "http://localhost:44903/?debug=1"}]);
    });

    it("is put in the page's address in place of its history entry, keeping the entry's state", () => {
        const page = new FakePage("http://localhost:44903/?debug=1");

        linkToCity(started, page);

        expect(page.replaced).toEqual([{data: {entry: 1}, url: `http://localhost:44903/?debug=1&city=${CITY}`}]);
    });

    it("says why a lost city is no longer open, and goes to the page without the link", () => {
        const page = new FakePage(`http://localhost:44903/?debug=1&city=${CITY}`);

        leaveLostCity(new Error("The city failed on the server"), page);

        expect(page.alerts).toEqual(["This city is no longer open here: The city failed on the server. Its link joins it " +
                                     "again."]);
        expect(page.assigned).toEqual(["http://localhost:44903/?debug=1"]);
    });
});
