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

import { DemandMessage } from "../src/protocol";
import {
  barRect, METER_HEIGHT, METER_WIDTH, MeterCanvas, MeterContext, MeterStyle, RCI, trackRect,
} from "../src/rci";

// The tracks are 18px wide, their middles 44px apart, the first 22px in, so they start at 13px, 57px and 101px. Each is
// 81px tall, with the 1px line across it 40px down.
describe("the demand meter's bars", () => {

    it("rises from the line for demand, residential first, 4px for each 200 of demand", () => {
        expect(barRect(0, 750)).toEqual({x: 13, y: 28, width: 18, height: 12});
    });

    it("hangs below the line for falling demand", () => {
        expect(barRect(1, -450)).toEqual({x: 57, y: 41, width: 18, height: 8});
    });

    // Industrial demand is scaled up from its range of 1500 to residential's 2000; commercial demand is not
    it("scales industrial demand to residential's range", () => {
        expect(barRect(2, 1500)).toEqual({x: 101, y: 0, width: 18, height: 40});
    });
});

type Drawn = {clear: true} | {transform: number[]} |
    {x: number, y: number, width: number, height: number, colour: string} | {label: string, colour: string};

// The look the meter is given, as the stylesheet's custom properties give it
const LOOK: MeterStyle = {bars: ["green", "blue", "yellow"], track: "dark", line: "grey", label: "white", font: "Inter"};

// A meter on a canvas that records what is drawn on it, and in what colour, at the pixels for each CSS pixel given.
// send gives it the demand, as each demand message does.
function meter(pixelRatio = 1) {
    const drawn: Drawn[] = [];
    const context: MeterContext = {
        setTransform: ((...transform: number[]) => {
            drawn.push({transform});
        }) as MeterContext["setTransform"],
        clearRect: () => {
            drawn.push({clear: true});
        },
        fillRect: (x, y, width, height) => {
            drawn.push({x, y, width, height, colour: context.fillStyle as string});
        },
        fillText: (label) => {
            drawn.push({label, colour: context.fillStyle as string});
        },
        fillStyle: "",
        font: "",
        textAlign: "start",
        textBaseline: "alphabetic",
    };
    const canvas: MeterCanvas = {
        width: 0, height: 0, style: {margin: "", padding: "", width: "", height: ""}, getContext: () => context,
    };
    const rci = new RCI(canvas, LOOK, pixelRatio);

    return {canvas, context, drawn, send: (demand: Omit<DemandMessage, "type">) => rci.update(demand)};
}

describe("the demand meter", () => {

    it("clears the canvas, then draws each track with its line, its bar and its initial, from the valves it's sent, " +
       "in the look it's given", () => {
        const {context, drawn, send} = meter();

        send({residential: 750, commercial: -450, industrial: 1500});

        const column = (index: number, value: number, label: string, colour: string) => [
            {...trackRect(index), colour: "dark"}, {...trackRect(index), y: 40, height: 1, colour: "grey"},
            {...barRect(index, value), colour}, {label, colour: "white"},
        ];
        expect(drawn).toEqual([{transform: [1, 0, 0, 1, 0, 0]}, {clear: true}, ...column(0, 750, "R", "green"),
                               ...column(1, -450, "C", "blue"), ...column(2, 1500, "I", "yellow")]);
        expect(context.font).toBe("700 11px Inter");
    });

    // The meter is made before its panel shows, and its panel may be folded, so it never takes its size from the page
    it("sizes its canvas as it is made, to hold the tracks, the longest bars either way and the initials", () => {
        const {canvas} = meter();
        const longest = [barRect(0, 2000), barRect(0, -2000), barRect(2, -1500), trackRect(2)];

        expect([canvas.width, canvas.height]).toEqual([METER_WIDTH, METER_HEIGHT]);
        expect([canvas.style.width, canvas.style.height]).toEqual([`${METER_WIDTH}px`, `${METER_HEIGHT}px`]);
        expect(longest.filter((rect) => rect.x < 0 || rect.y < 0 || rect.x + rect.width > canvas.width ||
                                        rect.y + rect.height > trackRect(0).height)).toEqual([]);
    });

    it("draws at the screen's pixels for each CSS pixel", () => {
        const {canvas, drawn, send} = meter(2);

        send({residential: 0, commercial: 0, industrial: 0});

        expect([canvas.width, canvas.height]).toEqual([2 * METER_WIDTH, 2 * METER_HEIGHT]);
        expect(drawn[0]).toEqual({transform: [2, 0, 0, 2, 0, 0]});
    });
});
