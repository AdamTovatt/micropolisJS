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

import { FOLDED_PANELS_KEY, FoldedPanels, FoldingElements, PanelFolding, PanelName } from "../src/panelFolding";
import { FakeStore } from "./helpers/fakeStore";

// A panel's element and the button on its strip, which record what folding writes, and a click on the button
function fakePanel() {
    const classes = new Set<string>();
    const attributes = new Map<string, string>();
    let click: (() => void) | null = null;

    const elements: FoldingElements = {
        panel: {classList: {toggle: (token, force) => {
            if (force) {
                classes.add(token);
            } else {
                classes.delete(token);
            }
            return force;
        }}},
        button: {
            textContent: null,
            setAttribute: (name, value) => attributes.set(name, value),
            addEventListener: (_type, listener) => {
                click = listener;
            },
        },
    };

    return {
        elements,
        click: () => click!(),
        // What the panel shows: whether it is folded, the button's text and whether it says the body is expanded
        shown: () => ({folded: classes.has("folded"), button: elements.button.textContent,
                       expanded: attributes.get("aria-expanded")}),
    };
}

function folding(store: FakeStore | null, names: PanelName[]) {
    const panels = new Map(names.map((name) => [name, fakePanel()]));
    const placed = new PanelFolding(new Map(Array.from(panels, ([name, panel]) => [name, panel.elements])),
                                    new FoldedPanels(store));
    return {placed, panels};
}

const FOLDED = {folded: true, button: "Show", expanded: "false"};
const UNFOLDED = {folded: false, button: "Hide", expanded: "true"};

describe("folding the panels", () => {

    it("shows every panel unfolded until the player folds one", () => {
        const {panels} = folding(new FakeStore(), ["city", "tools"]);

        expect(Array.from(panels.values(), (panel) => panel.shown())).toEqual([UNFOLDED, UNFOLDED]);
    });

    it("folds a panel and unfolds it again by the button on its strip, leaving the others be", () => {
        const {panels} = folding(new FakeStore(), ["city", "tools"]);

        panels.get("city")!.click();
        const folded = [panels.get("city")!.shown(), panels.get("tools")!.shown()];
        panels.get("city")!.click();

        expect(folded).toEqual([FOLDED, UNFOLDED]);
        expect(panels.get("city")!.shown()).toEqual(UNFOLDED);
    });

    it("folds and unfolds a panel as a key asks", () => {
        const {placed, panels} = folding(new FakeStore(), ["map"]);

        placed.toggle("map");

        expect(panels.get("map")!.shown()).toEqual(FOLDED);
    });

    it("keeps which panels are folded in the store, so a page opened again shows them folded", () => {
        const store = new FakeStore();
        const first = folding(store, ["demand", "status", "online"]);
        first.panels.get("demand")!.click();
        first.panels.get("online")!.click();

        const again = folding(store, ["demand", "status", "online"]);

        expect(Array.from(again.panels.values(), (panel) => panel.shown())).toEqual([FOLDED, UNFOLDED, FOLDED]);
        // The stored form is pinned: a later release reads what an earlier one wrote in the same browser
        expect(JSON.parse(store.getItem(FOLDED_PANELS_KEY)!)).toEqual(["demand", "online"]);
    });

    it("holds the setting for the page where the store can't be read or written, or there is none", () => {
        const failing = new FakeStore();
        failing.failing = true;

        for (const store of [failing, null]) {
            const {panels} = folding(store, ["menu"]);
            panels.get("menu")!.click();

            expect(panels.get("menu")!.shown()).toEqual(FOLDED);
        }
    });

    describe("a stored setting that isn't a list of panels", () => {
        let warn: jest.SpyInstance;

        beforeEach(() => {
            warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        });

        afterEach(() => {
            warn.mockRestore();
        });

        function storing(text: string): FakeStore {
            const store = new FakeStore();
            store.setItem(FOLDED_PANELS_KEY, text);
            return store;
        }

        it.each(["not json", "{\"city\": true}", "[\"city\", \"nowhere\"]"])("%s unfolds every panel, and says so",
                                                                              (text) => {
            const {panels} = folding(storing(text), ["city", "menu"]);

            expect(Array.from(panels.values(), (panel) => panel.shown())).toEqual([UNFOLDED, UNFOLDED]);
            expect(warn).toHaveBeenCalledTimes(1);
        });

        it("is replaced by a list of panels once the player folds one", () => {
            const store = storing("not json");
            const {panels} = folding(store, ["city", "menu"]);

            panels.get("menu")!.click();

            expect(JSON.parse(store.getItem(FOLDED_PANELS_KEY)!)).toEqual(["menu"]);
        });
    });
});
