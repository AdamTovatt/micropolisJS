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

import {
    MAX_SCROLL_TIME, SCROLL_SPEED, ScrollKeys, WheelZoom, cursorClass, heldKey, isMinimapKey, isShortcut, isToolPress,
    zoomKey,
} from "../src/inputStatus";
import { ZOOM_STEPS } from "../src/viewPosition";

describe("the keys the game follows", () => {

    it.each([
        ["ArrowUp", 38, "up"], ["W", 87, "up"],
        ["ArrowDown", 40, "down"], ["S", 83, "down"],
        ["ArrowRight", 39, "right"], ["D", 68, "right"],
        ["ArrowLeft", 37, "left"], ["A", 65, "left"],
        ["Escape", 27, "escape"],
    ])("hold %s (key code %i) as %s", (_, keyCode, key) => {
        expect(heldKey(keyCode)).toBe(key);
    });

    it.each([["Enter", 13], ["Space", 32], ["Q", 81]])("leave %s (key code %i) to the page", (_, keyCode) => {
        expect(heldKey(keyCode)).toBeNull();
    });
});

describe("a shortcut", () => {

    const plain = {altKey: false, ctrlKey: false, metaKey: false};

    it("is a key pressed with Ctrl, Alt or Meta, which leaves even a key the game follows to the browser", () => {
        expect([isShortcut({...plain, ctrlKey: true}), isShortcut({...plain, altKey: true}),
                isShortcut({...plain, metaKey: true})]).toEqual([true, true, true]);
    });

    it("is no key pressed alone", () => {
        expect(isShortcut(plain)).toBe(false);
    });
});

describe("the minimap's key", () => {

    const press = (key: string, modifiers: Partial<{altKey: boolean, ctrlKey: boolean, metaKey: boolean}> = {}) =>
        isMinimapKey({key, altKey: false, ctrlKey: false, metaKey: false, ...modifiers});

    it("is M, with Shift or without", () => {
        expect([press("m"), press("M")]).toEqual([true, true]);
    });

    it("leaves M with Ctrl, Alt or Meta to the browser, and other keys to the page", () => {
        expect([press("m", {ctrlKey: true}), press("m", {altKey: true}), press("M", {metaKey: true}), press("n")])
            .toEqual([false, false, false, false]);
    });
});

describe("a press the tool takes", () => {

    const plain = {button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false};

    it("is the primary button's", () => {
        expect(isToolPress(plain)).toBe(true);
    });

    it.each([["the middle button", {button: 1}], ["the secondary button", {button: 2}],
             ["shift", {shiftKey: true}], ["alt", {altKey: true}], ["control", {ctrlKey: true}],
             ["meta", {metaKey: true}]])("is not one with %s", (_, change) => {
        expect(isToolPress({...plain, ...change})).toBe(false);
    });
});

describe("the canvas's cursor", () => {

    it.each([["query", "helpPointer"], ["road", "pointer"], ["residential", "pointer"]])(
        "is set by its class for the %s tool", (tool, cursor) => {
        expect(cursorClass(tool)).toBe(cursor);
    });

    // Clearing a tool, the query tool's included, gives the canvas back the cursor it had before any was chosen
    it("is the default while no tool is chosen", () => {
        expect(cursorClass(null)).toBeNull();
    });
});

describe("zooming with the keyboard", () => {

    const press = (key: string, modifiers: Partial<{altKey: boolean, ctrlKey: boolean, metaKey: boolean}> = {}) =>
        zoomKey({key, altKey: false, ctrlKey: false, metaKey: false, ...modifiers});

    it("zooms in a step on + or =, its key unshifted, and out a step on -", () => {
        expect([press("+"), press("="), press("-")]).toEqual([1, 1, -1]);
    });

    it("leaves other keys to the page", () => {
        expect([press("_"), press("0"), press("ArrowUp")]).toEqual([null, null, null]);
    });

    it("leaves + and - with Ctrl, Alt or Meta to the browser, which zooms the page", () => {
        expect([press("+", {ctrlKey: true}), press("-", {metaKey: true}), press("=", {altKey: true})])
            .toEqual([null, null, null]);
    });
});

describe("zooming with the mouse wheel", () => {

    it("zooms in a step for each notch up, and out for each notch down", () => {
        const wheel = new WheelZoom();

        expect([wheel.steps(-100, 0), wheel.steps(-100, 0), wheel.steps(100, 0), wheel.steps(-300, 0)])
            .toEqual([1, 1, -1, 3]);
    });

    it("adds a touchpad's small movements up to a step", () => {
        const wheel = new WheelZoom();

        expect([wheel.steps(-40, 0), wheel.steps(-40, 0), wheel.steps(-40, 0)]).toEqual([0, 0, 1]);
    });

    it("starts again when the wheel turns back the other way", () => {
        const wheel = new WheelZoom();
        wheel.steps(-90, 0);

        expect([wheel.steps(20, 0), wheel.steps(-90, 0)]).toEqual([0, 0]);
    });

    it("counts a line as 16 pixels and a page as 800", () => {
        expect([new WheelZoom().steps(-7, 1), new WheelZoom().steps(-6, 1), new WheelZoom().steps(1, 2)])
            .toEqual([1, 0, -8]);
    });
});

describe("scrolling with the keyboard", () => {

    // The milliseconds a held key takes to scroll a tile at the zoom given
    const tileTime = (tileWidth: number) => tileWidth / SCROLL_SPEED * 1000;

    it("scrolls a tile at once for a press, and on at the scroll speed while the key is held", () => {
        const keys = new ScrollKeys();
        keys.press("right", false, 1000);

        expect(keys.take(1000, 16)).toEqual({x: 1, y: 0});
        expect(keys.take(1000 + tileTime(16) * 3, 16)).toEqual({x: 3, y: 0});
    });

    it.each(ZOOM_STEPS)("scrolls the same screen distance in the same time at %i pixels a tile", (tileWidth) => {
        const keys = new ScrollKeys();
        keys.press("down", false, 0);
        keys.take(0, tileWidth);

        // Eight seconds, which scroll whole tiles at each zoom, taken a second at a time
        let tiles = 0;
        for (let now = 1000; now <= 8000; now += 1000) {
            tiles += keys.take(now, tileWidth).y;
        }

        expect(tiles * tileWidth).toBe(8 * SCROLL_SPEED);
    });

    it("scrolls at most a second's worth after a stall, however long", () => {
        const keys = new ScrollKeys();
        keys.press("right", false, 0);
        keys.take(0, 16);

        expect(keys.take(5000, 16).x * 16).toBe(Math.floor(SCROLL_SPEED * MAX_SCROLL_TIME / 1000 / 16) * 16);
    });

    it("holds a key whose repeated keydown comes before any press, without a tile at once", () => {
        // As a key pressed while a window held the keyboard repeats once the window has closed
        const keys = new ScrollKeys();
        keys.press("right", true, 0);

        expect([keys.take(0, 16), keys.take(tileTime(16) * 2, 16)]).toEqual([{x: 0, y: 0}, {x: 2, y: 0}]);
    });

    it("scrolls by time, not by how often the game takes it", () => {
        const rare = new ScrollKeys();
        const often = new ScrollKeys();
        rare.press("left", false, 0);
        often.press("left", false, 0);

        let tiles = 0;
        for (let now = 0; now <= 500; now += 4) {
            tiles += often.take(now, 16).x;
        }

        expect(tiles).toBe(rare.take(500, 16).x);
        expect(tiles).toBe(-(1 + Math.floor(SCROLL_SPEED / 2 / 16)));
    });

    it("carries a part tile over to the next take, keeping the origin on whole tiles", () => {
        const keys = new ScrollKeys();
        keys.press("up", false, 0);
        keys.take(0, 64);

        const halfTile = tileTime(64) / 2;
        expect([keys.take(halfTile, 64), keys.take(2 * halfTile, 64)]).toEqual([{x: 0, y: 0}, {x: 0, y: -1}]);
    });

    it("scrolls a tile for a press let go before any take, and no further", () => {
        const keys = new ScrollKeys();
        keys.press("up", false, 0);
        keys.release("up", 2);

        expect([keys.take(100, 16), keys.take(200, 16)]).toEqual([{x: 0, y: -1}, {x: 0, y: 0}]);
    });

    it("scrolls no further for a key's repeated keydown", () => {
        const keys = new ScrollKeys();
        keys.press("up", false, 0);
        const first = keys.take(0, 16);
        keys.press("up", true, 10);
        keys.release("up", 11);

        expect([first, keys.take(12, 16)]).toEqual([{x: 0, y: -1}, {x: 0, y: 0}]);
    });

    it("scrolls along both axes at once", () => {
        const keys = new ScrollKeys();
        keys.press("left", false, 0);
        keys.press("down", false, 0);

        expect(keys.take(tileTime(16) * 2, 16)).toEqual({x: -3, y: 3});
    });

    it("scrolls the way of the key last pressed of two held along an axis, and on the other's once it is let go", () => {
        const keys = new ScrollKeys();
        keys.press("left", false, 0);
        keys.take(0, 16);
        keys.press("right", false, 0);

        expect(keys.take(tileTime(16) * 2, 16)).toEqual({x: 3, y: 0});

        keys.release("right", tileTime(16) * 2);
        expect(keys.take(tileTime(16) * 4, 16)).toEqual({x: -2, y: 0});
    });

    it("stops every key the page loses the keyboard with", () => {
        const keys = new ScrollKeys();
        keys.press("left", false, 0);
        keys.press("up", false, 0);
        keys.take(0, 16);
        keys.releaseAll(1);

        expect(keys.take(1000, 16)).toEqual({x: 0, y: 0});
    });
});
