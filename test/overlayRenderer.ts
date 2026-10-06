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

import { legendView, OverlayView, rampColour, Tint } from "../src/overlayRenderer";
import { OVERLAY_LAYERS, OverlayAnswer, OverlayLayer } from "../src/protocol";
import { Text } from "../src/text";

// The ends of the layers whose range isn't 0 to 1000, from Queries in the C# rules
const RANGES: Partial<Record<OverlayLayer, [number, number]>> = {
    rateOfGrowth: [-200, 200], housingAppeal: [-3000, 3000], powerGrid: [0, 1],
};

function rangeOf(layer: OverlayLayer): [number, number] {
    return RANGES[layer] ?? [0, 1000];
}

// Whether the layer's range runs either side of zero, as the renderer tells from an answer's
function diverges(layer: OverlayLayer): boolean {
    const [low, high] = rangeOf(layer);
    return low < 0 && high > 0;
}

const DIVERGING_LAYERS = OVERLAY_LAYERS.filter(diverges);

// An answer of the layer, with its range from Queries in the C# rules, holding the values
function answer(layer: OverlayLayer, values: number[], overrides: Partial<OverlayAnswer> = {}): OverlayAnswer {
    const [low, high] = rangeOf(layer);
    return {type: "overlay", layer, blockSize: 2, width: values.length, height: 1, low, high, values, ...overrides};
}

// A tint's colour, without its alpha
function rgb(tint: Tint | null): number[] {
    if (tint === null) {
        throw new Error("No tint");
    }

    return [tint.r, tint.g, tint.b];
}

// The heatmap's hues
const BLUE = [0, 0, 255];
const CYAN = [0, 255, 255];
const GREEN = [0, 255, 0];
const YELLOW = [255, 255, 0];
const RED = [255, 0, 0];

// The opacity overlayRenderer.ts gives every heatmap tint
const HEAT_ALPHA = 0.55;

// The layers drawn as a heatmap: all but the power grid
const HEAT_LAYERS = OVERLAY_LAYERS.filter((layer) => layer !== "powerGrid");

// A stop of the legend's gradient: its colour, its alpha, and its place along the bar, from 0 to 1
interface Stop {
    rgb: number[];
    a: number;
    at: number;
}

const STOP = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)(?: ([\d.]+)%)?/;

// The gradient's stops, an unplaced one at its end of the bar, as CSS places it
function stops(gradient: string | null): Stop[] {
    const found = (gradient?.match(new RegExp(STOP, "g")) ?? []).map((text) => {
        const [, r, g, b, a, at] = STOP.exec(text)!;
        return {rgb: [r, g, b].map(Number), a: Number(a), at: at === undefined ? NaN : Number(at) / 100};
    });
    return found.map((stop, i) => Number.isNaN(stop.at) ? {...stop, at: i === 0 ? 0 : 1} : stop);
}

describe("the overlay's heatmap", () => {

    // Fire coverage as the fixture cities' fire stations give it, up to their peak of 109 of the layer's 1000
    const fire = answer("fireCoverage", [0, 2, 0, 54, 109, 0, 55.5]);

    it("tints the answer's least value but zero blue, its greatest red and the middle between them green", () => {
        expect([rgb(rampColour(fire, 2)), rgb(rampColour(fire, 55.5)), rgb(rampColour(fire, 109))])
            .toEqual([BLUE, GREEN, RED]);
    });

    it("tints a quarter and three quarters of the way cyan and yellow, and goes straight between the hues", () => {
        const pollution = answer("pollution", [10, 50, 110]);

        expect([rgb(rampColour(pollution, 35)), rgb(rampColour(pollution, 85))]).toEqual([CYAN, YELLOW]);
        // 20 is a tenth of the way along, 0.4 of the way from blue to cyan, so green is 0.4 of 255; 100 is nine tenths,
        // 0.6 of the way from yellow to red, so green is 0.4 of 255 again
        expect(rgb(rampColour(pollution, 20))).toEqual([0, 102, 255]);
        expect(rgb(rampColour(pollution, 100))).toEqual([255, 102, 0]);
    });

    it("leaves zero untinted", () => {
        expect(rampColour(fire, 0)).toBeNull();
    });

    it.each(HEAT_LAYERS)("tints %s at one opacity throughout", (layer) => {
        const values = diverges(layer) ? [-150, -7, 3, 90] : [4, 37, 120, 260];
        const layerAnswer = answer(layer, values);

        expect(values.map((value) => rampColour(layerAnswer, value)!.a)).toEqual(values.map(() => HEAT_ALPHA));
    });

    it("spans the answer's values, not the layer's range", () => {
        expect(rampColour(answer("pollution", [3, 162]), 162)).toEqual(rampColour(answer("pollution", [1, 255]), 255));
        expect(rampColour(answer("pollution", [3, 162]), 162))
            .not.toEqual(rampColour(answer("pollution", [3, 255]), 162));
    });

    it("tints every value of an answer of one value but zero the middle of the ramp", () => {
        const one = answer("crime", [0, 70, 70, 0]);

        expect([rampColour(one, 0), rgb(rampColour(one, 70))]).toEqual([null, GREEN]);
    });

    it("tints nothing when every value is zero", () => {
        const none = answer("trafficDensity", [0, 0, 0]);

        expect(none.values.map((value) => rampColour(none, value))).toEqual([null, null, null]);
    });

    describe.each(DIVERGING_LAYERS)("for %s, which diverges", (layer) => {

        const growth = answer(layer, [-40, 0, 12, 120]);

        it("tints minus the largest magnitude blue, plus it red, the middle green, and leaves zero untinted", () => {
            expect([rgb(rampColour(growth, -120)), rgb(rampColour(growth, 120)), rgb(rampColour(growth, 1e-9))])
                .toEqual([BLUE, RED, GREEN]);
            expect(rampColour(growth, 0)).toBeNull();
        });

        it("tints the least value by its place from minus the largest magnitude, not as the low end", () => {
            expect(rgb(rampColour(growth, -40))).not.toEqual(BLUE);
            expect(rampColour(growth, -40)).toEqual(rampColour(answer(layer, [-40, 120, -120]), -40));
        });

        it("diverges about zero whatever the answer holds, all above zero or all below", () => {
            const growing = answer(layer, [30, 60]);
            const declining = answer(layer, [-30, -60]);

            expect([rgb(rampColour(growing, 60)), rgb(rampColour(growing, 30))]).toEqual([RED, YELLOW]);
            expect([rgb(rampColour(declining, -60)), rgb(rampColour(declining, -30))]).toEqual([BLUE, CYAN]);
        });
    });

    it("tints the power grid's powered tiles in one colour, and leaves the rest untinted", () => {
        const power = answer("powerGrid", [0, 1, 1, 0]);

        expect([rampColour(power, 0), rampColour(power, 1)]).toEqual([null, {r: 240, g: 200, b: 0, a: 0.75}]);
    });
});

describe("the overlay's legend", () => {

    it.each(OVERLAY_LAYERS)("names the layer %s", (layer) => {
        const legend = legendView(answer(layer, [0, 1]));
        const text = Text.overlays.layers[layer];

        expect(legend.title).toEqual(text.name);
        expect(text.name.length * text.low.length * text.high.length).toBeGreaterThan(0);
    });

    it("writes each end's value beside its word", () => {
        const legend = legendView(answer("pollution", [0, 3, 80, 162]));

        expect([legend.lowLabel, legend.highLabel]).toEqual(["None (3)", "Heavy (162)"]);
        expect(legend.note).toBeNull();
    });

    it.each([
        ["rateOfGrowth", "Declining (-120)", "Growing (120)"],
        ["housingAppeal", "Poor (-120)", "High (120)"],
    ] as const)("writes %s's diverging ends as minus and plus the largest magnitude", (layer, low, high) => {
        const legend = legendView(answer(layer, [-40, 0, 12, 120]));

        expect([legend.lowLabel, legend.highLabel]).toEqual([low, high]);
    });

    it.each(HEAT_LAYERS)("draws %s's ramp from blue to red, each stop the tint of the value at its place", (layer) => {
        const values = diverges(layer) ? [-30, 0, 90] : [5, 0, 245];
        const layerAnswer = answer(layer, values);
        const found = stops(legendView(layerAnswer).gradient);
        const [low, high] = diverges(layer) ? [-90, 90] : [5, 245];

        expect(found.map(({at}) => at)).toEqual([0, 0.25, 0.5, 0.75, 1]);
        for (const {rgb: colour, a, at} of found) {
            const tint = rampColour(layerAnswer, low + at * (high - low) || 1e-9);
            expect([colour, a]).toEqual([rgb(tint), tint!.a]);
        }
    });

    it("draws only the ramp's middle for an answer of one value but zero, which is all the map shows", () => {
        const one = answer("crime", [0, 70, 70, 0]);
        const legend = legendView(one);

        expect(stops(legend.gradient).map(({rgb: colour, a, at}) => [colour, a, at]))
            .toEqual([[GREEN, HEAT_ALPHA, 0], [GREEN, HEAT_ALPHA, 1]]);
        expect([legend.lowLabel, legend.highLabel]).toEqual(["None (70)", "High (70)"]);
    });

    it("says the layer has nothing to show yet in place of the values, and draws no ramp, when every value is zero", () => {
        const legend = legendView(answer("fireCoverage", [0, 0]));

        expect([legend.lowLabel, legend.highLabel, legend.gradient, legend.note])
            .toEqual(["None", "Full", null, Text.overlays.nothingToShow]);
    });

    it("leaves the power grid's words without values, and fades from untinted to its powered tint", () => {
        const power = answer("powerGrid", [0, 1]);
        const legend = legendView(power);
        const found = stops(legend.gradient);

        expect([legend.lowLabel, legend.highLabel, legend.note]).toEqual(["Unpowered", "Powered", null]);
        expect(found.map(({rgb: colour, a, at}) => [colour, a, at]))
            .toEqual([[rgb(rampColour(power, 1)), 0, 0], [rgb(rampColour(power, 1)), 0.75, 1]]);
    });
});

describe("an overlay view", () => {

    // Blocks of 2 tiles, 3 across and 2 down, over a map of 5 by 3 tiles: the last column and row of blocks reach
    // past it
    const view = new OverlayView(answer("crime", [0, 50, 100, 150, 200, 250], {width: 3, height: 2}));

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
