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

import { ScrollKeys, WheelZoom, cursorClass, heldKey, isToolPress, zoomKey } from "../src/inputStatus";

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

    it("scrolls on every tick while a key is held, and on none once it is let go", () => {
        const keys = new ScrollKeys();
        keys.press("left", false);

        const held = [keys.take(), keys.take()];
        keys.release("left");

        expect([...held, keys.take()]).toEqual(["left", "left", null]);
    });

    it("scrolls once for a press let go before any tick took it", () => {
        const keys = new ScrollKeys();
        keys.press("up", false);
        keys.release("up");

        expect([keys.take(), keys.take()]).toEqual(["up", null]);
    });

    it("scrolls no further for a key's repeated keydown after a tick, when the key is let go before the next", () => {
        const keys = new ScrollKeys();
        keys.press("up", false);
        const first = keys.take();
        keys.press("up", true);
        keys.release("up");

        expect([first, keys.take()]).toEqual(["up", null]);
    });

    it("takes the first of several keys, left, up, right then down, and forgets the other presses", () => {
        const keys = new ScrollKeys();
        keys.press("down", false);
        keys.press("right", false);
        keys.release("down");
        keys.release("right");

        expect([keys.take(), keys.take()]).toEqual(["right", null]);
    });
});
