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

import { contrastRatio, cssColour, laidOver } from "./helpers/contrast";

// The colour helpers the HUD's colour test and the layout check measure contrast with

describe("a colour laid over another", () => {

    it("mixes them by the top one's opacity, each channel rounded as a browser draws it", () => {
        expect(laidOver("#ffffff80", "#000000")).toBe("#808080");
        expect(laidOver("#ff000040", "#0000ff")).toBe("#4000bf");
    });

    it("is the top one where that is opaque", () => {
        expect(laidOver("#123456", "#ffffff")).toBe("#123456");
        expect(laidOver("#123456ff", "#ffffff")).toBe("#123456");
    });

    it.each([["#fff", "#000000"], ["#ffffff80", "#00000080"], ["white", "#000000"]])(
        "fails on %s over %s", (top, under) => {
        expect(() => laidOver(top, under)).toThrow("Not a colour written #rrggbbaa over one written #rrggbb");
    });
});

describe("a colour as a browser computes it", () => {

    it.each([["rgb(18, 52, 86)", "#123456"], ["rgba(255, 255, 255, 0.5)", "#ffffff80"],
             ["rgba(0, 0, 0, 0)", "#00000000"], ["rgb(18 52 86 / 0.5)", "#12345680"], ["rgba(1, 2, 3, 1)", "#010203"]])(
        "reads %s as %s", (computed, written) => {
        expect(cssColour(computed)).toBe(written);
    });

    it.each(["transparent", "#ffffff", "rgb(1, 2)", "hsl(0, 0%, 0%)"])("fails on %s", (computed) => {
        expect(() => cssColour(computed)).toThrow("Not a colour written rgb() or rgba()");
    });
});

describe("the contrast of two colours", () => {

    it("is 21 for black and white either way round, and 1 for a colour and itself", () => {
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
        expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21);
        expect(contrastRatio("#777777", "#777777")).toBe(1);
    });
});
