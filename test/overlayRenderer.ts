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

import { legendView, OverlayView, rampColour, Tint } from "../src/overlayRenderer";
import { OVERLAY_LAYERS, OverlayAnswer, OverlayLayer } from "../src/protocol";
import { Text } from "../src/text";

function answer(layer: OverlayLayer, low: number, high: number, overrides: Partial<OverlayAnswer> = {}): OverlayAnswer {
    return {type: "overlay", layer, blockSize: 2, width: 2, height: 2, low, high, values: [0, 0, 0, 0], ...overrides};
}

// A tint's alpha, 0 for none
function alpha(tint: Tint | null): number {
    return tint === null ? 0 : tint.a;
}

// A tint's colour, without its alpha
function rgb(tint: Tint | null): number[] {
    if (tint === null) {
        throw new Error("No tint");
    }

    return [tint.r, tint.g, tint.b];
}

// The opacity overlayRenderer.ts gives a ramp's high end, its full opacity
const FULL_OPACITY = 0.75;

// A value's tint's share of the opacity of the answer's high end
function share(answer: OverlayAnswer, value: number): number {
    return alpha(rampColour(answer, value)) / alpha(rampColour(answer, answer.high));
}

// A stop of the legend's gradient: its colour, its alpha, and its place along the bar, from 0 to 1
interface Stop {
    rgb: number[];
    a: number;
    at: number;
}

const STOP = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\) ([\d.]+)%/;

function stops(gradient: string): Stop[] {
    return (gradient.match(new RegExp(STOP, "g")) ?? []).map((text) => {
        const [, r, g, b, a, at] = STOP.exec(text)!.map(Number);
        return {rgb: [r, g, b], a, at: at / 100};
    });
}

// Expects the legend's gradient to draw the answer's ramp: each stop the tint of the value at its place along the bar,
// from the low end to the high end, and more stops than a straight line between them needs, for the curve
function expectLegendDrawsRamp(answer: OverlayAnswer): void {
    const found = stops(legendView(answer).gradient);

    expect(found.length).toBeGreaterThan(4);
    expect([found[0].at, found[found.length - 1].at]).toEqual([0, 1]);
    // In order along the bar, which CSS would otherwise quietly clamp
    expect(found.map(({at}) => at)).toEqual(found.map(({at}) => at).sort((a, b) => a - b));
    for (const {rgb: colour, a, at} of found) {
        const tint = rampColour(answer, answer.low + at * (answer.high - answer.low));
        expect(a).toBeCloseTo(alpha(tint), 2);
        if (tint !== null) {
            expect(colour).toEqual(rgb(tint));
        }
    }
}

describe("the overlay's colour ramp", () => {

    const pollution = answer("pollution", 0, 255);

    it("leaves the low end untinted", () => {
        expect(rampColour(pollution, 0)).toBeNull();
    });

    it("tints any value above the low end at least about a third of the full opacity, which the high end has", () => {
        const fine = answer("pollution", 0, 10000);

        expect(share(fine, 1)).toBeGreaterThan(0.3);
        expect(share(fine, 1)).toBeLessThan(0.4);
        expect(alpha(rampColour(fine, 10000))).toBe(FULL_OPACITY);
    });

    it("grows with the square root of the value's place in the range", () => {
        const fine = answer("pollution", 0, 10000);

        // Measured from a place near the low end, so the floor drops out: from 0.01 to 0.25 of the range is 0.4 of
        // the square root's growth from 0.01 to 0.64, 0.7
        expect((share(fine, 2500) - share(fine, 100)) / (share(fine, 6400) - share(fine, 100))).toBeCloseTo(0.4 / 0.7, 2);
    });

    it("keeps the fire coverage real cities reach, a small part of its range, visible and distinct", () => {
        const fire = answer("fireCoverage", 0, 1000);
        // The coverage the fire stations of the fixture cities' saves in conformance/saves/ give, up to their peaks
        // of 54 and 109 of the layer's 1000
        const values = [1, 11, 27, 54, 109];
        const alphas = values.map((value) => alpha(rampColour(fire, value)));

        expect(Math.min(...values.map((value) => share(fire, value)))).toBeGreaterThan(0.3);
        expect(alphas).toEqual([...alphas].sort((a, b) => a - b));
        expect(new Set(alphas).size).toBe(alphas.length);
    });

    it("tints in the layer's own colour throughout", () => {
        const colours = [1, 128, 255].map((value) => rgb(rampColour(pollution, value)));

        expect(colours).toEqual([colours[2], colours[2], colours[2]]);
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

        it("tints any value either side of zero at least about a third of the full opacity, which each end has", () => {
            // Each against the end on its own side
            for (const [value, end] of [[-1, -200], [1, 200]]) {
                expect(alpha(rampColour(growth, value)) / alpha(rampColour(growth, end))).toBeGreaterThan(0.3);
                expect(alpha(rampColour(growth, value)) / alpha(rampColour(growth, end))).toBeLessThan(0.4);
            }
            expect([alpha(rampColour(growth, -200)), alpha(rampColour(growth, 200))])
                .toEqual([FULL_OPACITY, FULL_OPACITY]);
        });

        it("tints each way in its own colour throughout", () => {
            expect(rgb(rampColour(growth, -1))).toEqual(rgb(rampColour(growth, -200)));
            expect(rgb(rampColour(growth, 1))).toEqual(rgb(rampColour(growth, 200)));
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

    it("draws the ramp's curve in the layer's colour, from transparent at the low end to the high end's tint", () => {
        const pollution = answer("pollution", 0, 255);
        const found = stops(legendView(pollution).gradient);

        expectLegendDrawsRamp(pollution);
        expect([found[0].a, found[found.length - 1].a]).toEqual([0, alpha(rampColour(pollution, 255))]);
    });

    it("draws a range either side of zero from decline, fading out to transparent at zero, then in to growth", () => {
        const growth = answer("rateOfGrowth", -200, 200);
        const zero = stops(legendView(growth).gradient).filter(({at}) => at === 0.5);

        expectLegendDrawsRamp(growth);
        expect(zero.map(({rgb: colour, a}) => [colour, a]))
            .toEqual([[rgb(rampColour(growth, -200)), 0], [rgb(rampColour(growth, 200)), 0]]);
    });

    it("places zero where it falls in a range either side of it", () => {
        const growth = answer("rateOfGrowth", -100, 300);

        expectLegendDrawsRamp(growth);
        expect(stops(legendView(growth).gradient).filter(({a}) => a === 0).map(({at}) => at)).toEqual([0.25, 0.25]);
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
