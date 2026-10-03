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

import { dateText, InfoBar, InfoBarElements } from "../src/infoBar";

describe("the info bar's date", () => {

    it.each([[0, 1900, "Jan 1900"], [11, 1902, "Dec 1902"]])("shows month %i of %i as %s", (month, year, text) => {
        expect(dateText({month, year})).toBe(text);
    });
});

describe("the info bar", () => {

    // An info bar on elements of its own
    function infoBar() {
        const elements: InfoBarElements = {
            classification: {textContent: ""}, population: {textContent: ""}, score: {textContent: ""},
            funds: {textContent: ""}, date: {textContent: ""}, name: {textContent: ""},
        };

        const bar = new InfoBar(elements, "Town");
        const shown = () => Object.fromEntries(Object.entries(elements).map(([key, e]) => [key, e.textContent]));
        return {bar, shown};
    }

    it("shows the city's name, and the date, population, evaluation and funds it is given, each in its own element", () => {
        const {bar, shown} = infoBar();

        bar.showDate({month: 3, year: 1901});
        bar.showPopulation({population: 2400});
        bar.showEvaluation({cityClass: "TOWN", score: 612});
        bar.showBudget({funds: 18750});

        expect(shown()).toEqual({classification: "TOWN", population: "2400", score: "612", funds: "18750",
                                 date: "Apr 1901", name: "Town"});
    });

    it("shows the latest figures it is given", () => {
        const {bar, shown} = infoBar();

        bar.showDate({month: 0, year: 1900});
        bar.showPopulation({population: 0});
        bar.showEvaluation({cityClass: "VILLAGE", score: 500});
        bar.showBudget({funds: 20000});
        bar.showDate({month: 1, year: 1900});
        bar.showPopulation({population: 120});
        bar.showEvaluation({cityClass: "VILLAGE", score: 510});
        bar.showBudget({funds: 19500});

        expect(shown()).toMatchObject({population: "120", score: "510", funds: "19500", date: "Feb 1900"});
    });
});
