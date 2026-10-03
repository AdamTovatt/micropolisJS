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

import { AUTO_BULLDOZE_KEY, AutoBulldozePreference, PreferenceStore } from "../src/autoBulldozePreference";

// A store over a plain map, as localStorage keeps strings by key
function store(entries: Record<string, string> = {}): PreferenceStore & {entries: Record<string, string>} {
    return {
        entries,
        getItem: (key) => (key in entries ? entries[key] : null),
        setItem: (key, value) => {
            entries[key] = value;
        },
    };
}

describe("the auto-bulldoze preference", () => {

    it("is on for a player who has never set it", () => {
        expect(new AutoBulldozePreference(store()).isOn()).toBe(true);
    });

    it.each([true, false])("keeps %s under its own key, for the next game", (on) => {
        const kept = store();

        new AutoBulldozePreference(kept).set(on);

        expect(kept.entries).toEqual({[AUTO_BULLDOZE_KEY]: String(on)});
        expect(new AutoBulldozePreference(kept).isOn()).toBe(on);
    });

    it("holds the setting for this game without a store", () => {
        const preference = new AutoBulldozePreference(null);

        preference.set(false);

        expect(preference.isOn()).toBe(false);
    });

    // As localStorage does when it is full or disabled
    it("holds the setting for this game when the store throws", () => {
        const failing = {
            getItem: () => { throw new Error("disabled"); },
            setItem: () => { throw new Error("full"); },
        };

        const preference = new AutoBulldozePreference(failing);
        expect(preference.isOn()).toBe(true);

        preference.set(false);
        expect(preference.isOn()).toBe(false);
    });
});
