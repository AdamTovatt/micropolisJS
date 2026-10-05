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

import { Displayable, isHidden, isShown, setShown, sizeCanvas, toggleShown } from "../src/domElements";
import { styledBy } from "./helpers/stylingWindow";

type FakeElement = Displayable<FakeElement>;

// An element the stylesheet lays out with the display given, such as "none" for one a class hides
function element(sheetDisplay: string, inlineDisplay = ""): FakeElement {
    return {style: {display: inlineDisplay}, ownerDocument: styledBy(sheetDisplay)};
}

describe("showing and hiding an element", () => {

    it.each([
        ["the stylesheet hides", "none", "", true],
        ["its inline style hides", "flex", "none", true],
        ["the stylesheet lays out", "flex", "", false],
        ["its inline style shows over a stylesheet that hides", "none", "block", false],
    ])("finds hidden an element %s", (_, sheet, inline, hidden) => {
        expect(isHidden(element(sheet, inline))).toBe(hidden);
    });

    it("shows an element the stylesheet lays out as the stylesheet does", () => {
        const flex = element("flex", "none");

        setShown(flex, true);

        expect(flex.style.display).toBe("");
    });

    it("shows an element the stylesheet hides as a block", () => {
        const hidden = element("none");

        setShown(hidden, true);

        expect(hidden.style.display).toBe("block");
    });

    it("hides an element inline, whatever the stylesheet says", () => {
        const flex = element("flex");

        setShown(flex, false);

        expect(flex.style.display).toBe("none");
    });

    it("toggles an element the stylesheet hides to a block and back, saying whether it shows", () => {
        const hidden = element("none");

        const shows = [toggleShown(hidden), hidden.style.display, toggleShown(hidden), hidden.style.display];

        expect(shows).toEqual([true, "block", false, "none"]);
    });

    it("finds an element shown when it has a box on the page", () => {
        expect([isShown({getClientRects: () => ({length: 1})}), isShown({getClientRects: () => ({length: 0})})])
            .toEqual([true, false]);
    });

    it("sizes a canvas's backing store to the pixel ratio, rounded, and its box in CSS pixels", () => {
        const canvas = {width: 0, height: 0, style: {width: "", height: ""}};

        sizeCanvas(canvas as unknown as HTMLCanvasElement, 177, 128, 1.1);

        expect(canvas).toEqual({width: 195, height: 141, style: {width: "177px", height: "128px"}});
    });
});
