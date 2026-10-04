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

import { legendView, OverlayView, rampColour, Tint, tintCss } from "../src/overlayRenderer";
import { OVERLAY_LAYERS, OverlayAnswer, OverlayLayer } from "../src/protocol";
import { Text } from "../src/text";

function answer(layer: OverlayLayer, low: number, high: number, overrides: Partial<OverlayAnswer> = {}): OverlayAnswer {
    return {type: "overlay", layer, blockSize: 2, width: 2, height: 2, low, high, values: [0, 0, 0, 0], ...overrides};
}

// A tint's alpha, 0 for none
function alpha(tint: Tint | null): number {
    return tint === null ? 0 : tint.a;
}

// A tint as the legend's gradient writes it
function css(tint: Tint | null): string {
    if (tint === null) {
        throw new Error("No tint");
    }

    return tintCss(tint);
}

describe("the overlay's colour ramp", () => {

    const pollution = answer("pollution", 0, 255);

    it("leaves the low end untinted", () => {
        expect(rampColour(pollution, 0)).toBeNull();
    });

    it("tints more strongly toward the high end", () => {
        const alphas = [1, 64, 128, 192, 255].map((value) => alpha(rampColour(pollution, value)));

        expect(alphas[0]).toBeGreaterThan(0);
        expect(alphas).toEqual([...alphas].sort((a, b) => a - b));
        expect(new Set(alphas).size).toBe(alphas.length);
        expect(alphas[4]).toBeLessThan(1);
    });

    it("tints a value past an end as that end", () => {
        const coverage = answer("policeCoverage", 0, 1000);

        expect(rampColour(coverage, 1500)).toEqual(rampColour(coverage, 1000));
        expect(rampColour(coverage, -5)).toBeNull();
    });

    it("scales to the answer's range, not a fixed one", () => {
        expect(rampColour(answer("pollution", 0, 255), 255)).toEqual(rampColour(answer("pollution", 0, 510), 510));
        expect(rampColour(answer("pollution", 0, 255), 255))
            .not.toEqual(rampColour(answer("pollution", 0, 510), 255));
    });

    it("tints the power grid's powered tiles and leaves the rest", () => {
        const power = answer("powerGrid", 0, 1);

        expect(rampColour(power, 0)).toBeNull();
        expect(rampColour(power, 1)).not.toBeNull();
    });

    describe("for a range either side of zero", () => {

        const growth = answer("rateOfGrowth", -200, 200);

        it("leaves zero untinted, and tints decline and growth in different colours", () => {
            expect(rampColour(growth, 0)).toBeNull();
            expect(alpha(rampColour(growth, -200))).toBe(alpha(rampColour(growth, 200)));
            expect(rampColour(growth, -200)).not.toEqual(rampColour(growth, 200));
        });

        it("tints more strongly away from zero, each way", () => {
            expect(alpha(rampColour(growth, -50))).toBeLessThan(alpha(rampColour(growth, -150)));
            expect(alpha(rampColour(growth, 50))).toBeLessThan(alpha(rampColour(growth, 150)));
        });
    });
});

describe("the overlay's legend", () => {

    it.each(OVERLAY_LAYERS)("names the layer %s and the words for its ends", (layer) => {
        const legend = legendView(answer(layer, 0, 100));
        const text = Text.overlays.layers[layer];

        expect([legend.title, legend.lowLabel, legend.highLabel]).toEqual([text.name, text.low, text.high]);
        expect(text.name.length * text.low.length * text.high.length).toBeGreaterThan(0);
    });

    it("draws the ramp from the untinted low end to the colour of the high end", () => {
        const pollution = answer("pollution", 0, 255);
        const legend = legendView(pollution);

        expect(legend.gradient).toMatch(/^linear-gradient\(to right, rgba\([^)]*, 0\), /);
        expect(legend.gradient.endsWith(`${css(rampColour(pollution, 255))})`)).toBe(true);
    });

    it("draws a range either side of zero from decline through untinted to growth", () => {
        const growth = answer("rateOfGrowth", -200, 200);
        const stops = legendView(growth).gradient.match(/rgba\([^)]*\)/g);

        expect(stops).toEqual([css(rampColour(growth, -200)), expect.stringMatching(/, 0\)$/),
                               css(rampColour(growth, 200))]);
    });
});

describe("an overlay view", () => {

    // Blocks of 2 tiles, 3 across and 2 down, over a map of 5 by 3 tiles: the last column and row of blocks reach
    // past it
    const view = new OverlayView(answer("crime", 0, 250, {width: 3, height: 2, values: [0, 50, 100, 150, 200, 250]}));

    it("tints each tile with its block's value", () => {
        expect(view.tileTint(0, 0)).toBeNull();
        expect(view.tileTint(2, 1)).toEqual(rampColour(view.answer, 50));
        expect(view.tileTint(3, 0)).toEqual(rampColour(view.answer, 50));
        expect(view.tileTint(4, 0)).toEqual(rampColour(view.answer, 100));
        expect(view.tileTint(0, 2)).toEqual(rampColour(view.answer, 150));
        expect(view.tileTint(5, 3)).toEqual(rampColour(view.answer, 250));
    });

    it("tints nothing outside its blocks", () => {
        expect([view.tileTint(-1, 0), view.tileTint(0, -1), view.tileTint(6, 0), view.tileTint(0, 4)])
            .toEqual([null, null, null, null]);
    });
});
