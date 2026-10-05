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

import { AUTO_BULLDOZE_KEY, AutoBulldozePreference } from "../src/autoBulldozePreference";
import { FakeStore } from "./helpers/fakeStore";

describe("the auto-bulldoze preference", () => {

    it("is on for a player who has never set it", () => {
        expect(new AutoBulldozePreference(new FakeStore()).isOn()).toBe(true);
    });

    it.each([true, false])("keeps %s under its own key, for the next game", (on) => {
        const kept = new FakeStore();

        new AutoBulldozePreference(kept).set(on);

        expect(Object.fromEntries(kept.items)).toEqual({[AUTO_BULLDOZE_KEY]: String(on)});
        expect(new AutoBulldozePreference(kept).isOn()).toBe(on);
    });

    it("holds the setting for this game without a store", () => {
        const preference = new AutoBulldozePreference(null);

        preference.set(false);

        expect(preference.isOn()).toBe(false);
    });

    // As localStorage does when it is full or disabled
    it("holds the setting for this game when the store throws", () => {
        const failing = new FakeStore();
        failing.failing = true;

        const preference = new AutoBulldozePreference(failing);
        expect(preference.isOn()).toBe(true);

        preference.set(false);
        expect(preference.isOn()).toBe(false);
    });
});
