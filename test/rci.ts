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

import { VALVES_UPDATED } from "../src/messages";
import { barRect, MeterCanvas, MeterContext, RCI, Valves } from "../src/rci";

// The meter is drawn in 5px rects, in units of padding of 3 rects (15px). The grey box is 1 unit (15px) in, below a
// full bar of 10 rects and 1 unit (65px down); it is 7 units (105px) wide and 1 unit tall.
const BOX = {x: 15, y: 65, width: 105, height: 15};

// A bar of demand rises from the box's top, at 65px, and a bar of none hangs from its bottom, at 80px. A bar is 15px
// wide, and each 200 of demand is 5px tall.
describe("the demand meter's bars", () => {

    it("rises from the box for demand, residential first", () => {
        expect(barRect(0, 750)).toEqual({x: 30, y: 50, width: 15, height: 15});
    });

    it("hangs below the box for falling demand", () => {
        expect(barRect(1, -450)).toEqual({x: 60, y: 80, width: 15, height: 10});
    });

    // Industrial demand is scaled up from its range of 1500 to residential's 2000; commercial demand is not
    it("scales industrial demand to residential's range", () => {
        expect(barRect(2, 1500)).toEqual({x: 90, y: 15, width: 15, height: 50});
    });
});

type Drawn = {clear: true} | {x: number, y: number, width: number, height: number} | {label: string};

interface Size {
    width: number;
    height: number;
}

// A meter on a canvas that records what is drawn on it, in a container of the size given. The meter follows only the
// valves event.
function meter(size: Size) {
    const drawn: Drawn[] = [];
    const context: MeterContext = {
        clearRect: () => {
            drawn.push({clear: true});
        },
        fillRect: (x, y, width, height) => {
            drawn.push({x, y, width, height});
        },
        fillText: (label) => {
            drawn.push({label});
        },
        fillStyle: "",
        font: "",
        textBaseline: "alphabetic",
    };
    const canvas: MeterCanvas = {width: 0, height: 0, style: {margin: "", padding: ""}, getContext: () => context};
    const container = {getBoundingClientRect: () => size};
    let send: ((valves: Valves) => void) | null = null;

    new RCI(container, canvas, {addEventListener: (event, listener) => {
        if (event === VALVES_UPDATED) {
            send = listener;
        }
    }});

    return {
        drawn,
        send: (valves: Valves) => {
            if (send === null) {
                throw new Error("The meter follows no valves event");
            }
            send(valves);
        },
    };
}

describe("the demand meter", () => {

    it("clears the canvas, then draws the box, and each bar with its initial, from the valves it's sent", () => {
        const {drawn, send} = meter({width: 160, height: 160});

        send({residential: 750, commercial: -450, industrial: 1500});

        expect(drawn).toEqual([{clear: true}, BOX, barRect(0, 750), {label: "R"}, barRect(1, -450), {label: "C"},
                               barRect(2, 1500), {label: "I"}]);
    });
});
