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

import { CityStatus } from "../src/cityStatus";
import * as Messages from "../src/messages";
import { statusView } from "../src/statusPanel";
import { Text } from "../src/text.js";

function status(overrides: Partial<CityStatus>): CityStatus {
    return {
        commercialCapped: false,
        conditions: [],
        industrialCapped: false,
        powerCapacity: 700,
        powerLoad: 340,
        residentialCapped: false,
        ...overrides,
    };
}

describe("the status panel's view of the power figures", () => {

    it("shows the load against the capacity", () => {
        expect(statusView(status({})).powerText).toBe("340 / 700");
    });

    it.each([
        ["within capacity", 340, 700, false, 49],
        ["at capacity", 700, 700, false, 100],
        ["over capacity", 800, 700, true, 100],
        ["drawing power with no plant", 5, 0, true, 100],
    ])("%s (load %p, capacity %p): overloaded %p, meter at %p%", (_, powerLoad, powerCapacity, overloaded,
                                                                   meterPercent) => {
        const view = statusView(status({powerCapacity, powerLoad}));

        expect([view.overloaded, view.meterPercent, view.meterVisible]).toEqual([overloaded, meterPercent, true]);
    });

    it("hides the meter when there is no plant and no load", () => {
        const view = statusView(status({powerCapacity: 0, powerLoad: 0}));

        expect([view.overloaded, view.meterVisible]).toEqual([false, false]);
    });
});

describe("the status panel's view of the demand caps", () => {

    it("shows no marker when no cap holds", () => {
        expect(statusView(status({})).caps).toEqual([]);
    });

    it("shows a marker for each cap that holds, residential, commercial then industrial", () => {
        const view = statusView(status({commercialCapped: true, industrialCapped: true, residentialCapped: true}));

        expect(view.caps).toEqual([
            {label: Text.statusPanel.residentialCap, title: Text.statusPanel.residentialCapTitle},
            {label: Text.statusPanel.commercialCap, title: Text.statusPanel.commercialCapTitle},
            {label: Text.statusPanel.industrialCap, title: Text.statusPanel.industrialCapTitle},
        ]);
    });

    it("shows only the caps that hold", () => {
        const view = statusView(status({industrialCapped: true}));

        expect(view.caps.map((cap) => cap.label)).toEqual([Text.statusPanel.industrialCap]);
    });
});

describe("the status panel's view of the advisor conditions", () => {

    it("shows each condition's message, in the record's order", () => {
        const view = statusView(status({conditions: [Messages.NEED_STADIUM, Messages.HIGH_CRIME]}));

        expect(view.conditions).toEqual(["Residents demand a Stadium", "Crime very high"]);
    });
});
