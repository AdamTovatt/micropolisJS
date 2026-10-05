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

import { CAR_SHARE_KEY, CAR_SHARE_STEPS, CarSharePreference } from "../src/carShare";
import { FakeStore } from "./helpers/fakeStore";

// The step every trip becomes a car at
const ALL = CAR_SHARE_STEPS[4];

describe("the Cars slider's steps", () => {
    it("are Off, 10%, 25%, 50% and All, each taking every so many trips", () => {
        expect(CAR_SHARE_STEPS).toEqual([{name: "Off", every: null}, {name: "10%", every: 10}, {name: "25%", every: 4},
                                         {name: "50%", every: 2}, {name: "All", every: 1}]);
    });
});

describe("the share of the trips that become cars", () => {

    it("is All for a browser that never set it", () => {
        expect(new CarSharePreference(new FakeStore()).step()).toBe(ALL);
    });

    it.each(CAR_SHARE_STEPS.map((step) => [step.name, step]))("keeps %s under its own key, for the next game",
        (name, step) => {
            const kept = new FakeStore();

            new CarSharePreference(kept).set(step);

            expect(Object.fromEntries(kept.items)).toEqual({[CAR_SHARE_KEY]: name});
            expect(new CarSharePreference(kept).step()).toBe(step);
        });

    it.each(["", "0.1", "all", "100%"])("is All where the name kept, %j, is no step's", (text) => {
        const kept = new FakeStore();
        kept.items.set(CAR_SHARE_KEY, text);

        expect(new CarSharePreference(kept).step()).toBe(ALL);
    });

    it("holds the step for this game without a store", () => {
        const preference = new CarSharePreference(null);

        preference.set(CAR_SHARE_STEPS[2]);

        expect(preference.step()).toBe(CAR_SHARE_STEPS[2]);
    });

    // As localStorage does when it is full or disabled
    it("is All when the store throws", () => {
        const failing = new FakeStore();
        failing.failing = true;

        expect(new CarSharePreference(failing).step()).toBe(ALL);
    });

    it("holds the step for this game when the store throws", () => {
        const failing = new FakeStore();
        failing.failing = true;
        const preference = new CarSharePreference(failing);

        preference.set(CAR_SHARE_STEPS[0]);

        expect(preference.step()).toBe(CAR_SHARE_STEPS[0]);
    });
});
