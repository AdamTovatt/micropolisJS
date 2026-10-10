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

import {
    MAX_SCROLL_TIME, SCROLL_SPEED, ScrollKeys, ShiftKey, SpacePan, WheelZoom, buttonTool, cellsPerTile, cursorClass, heldKey,
    isMinimapKey, isShortcut, spacePans, toolColours, toolPress, zoomKey,
} from "../src/inputStatus";
import { CURSOR_TOOLS, type CursorTool } from "../src/protocol";
import { ViewPosition, ZOOM_STEPS, viewport } from "../src/viewPosition";

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

    it("is the primary button's, which puts down what the tool does", () => {
        expect(toolPress(plain, "road")).toBe("place");
    });

    it.each<CursorTool>(["road", "residential", "park", "station", "walkway"])(
        "erases with Shift held, for the %s, which puts something down", (tool) => {
            expect(toolPress({...plain, shiftKey: true}, tool)).toBe("erase");
        });

    it.each<CursorTool>(["bulldozer", "query"])("is none with Shift held, for the %s, which has no eraser", (tool) => {
        expect(toolPress({...plain, shiftKey: true}, tool)).toBeNull();
    });

    it.each([["the middle button", {button: 1}], ["the secondary button", {button: 2}],
             ["alt", {altKey: true}], ["control", {ctrlKey: true}], ["meta", {metaKey: true}],
             ["shift and alt", {shiftKey: true, altKey: true}]])("is none with %s", (_, change) => {
        expect(toolPress({...plain, ...change}, "road")).toBeNull();
    });
});

describe("Shift", () => {

    it("turns a tool that puts something down into its eraser while an event says it is down", () => {
        const shift = new ShiftKey();
        shift.follow({shiftKey: true});
        expect([shift.erases("road"), shift.erases("walkway"), shift.erases("residential")]).toEqual([true, true, true]);
    });

    it("turns neither the bulldozer nor the query tool, nor no tool, into an eraser", () => {
        const shift = new ShiftKey();
        shift.follow({shiftKey: true});
        expect([shift.erases("bulldozer"), shift.erases("query"), shift.erases(null)]).toEqual([false, false, false]);
    });

    it("is up once an event says so, as a mouse event does for a Shift that came up while the page had no keyboard",
       () => {
        const shift = new ShiftKey();
        shift.follow({shiftKey: true});
        shift.follow({shiftKey: false});
        expect(shift.erases("road")).toBe(false);
    });

    it("is down once an event says so, as a mouse event does for a Shift held as the page got the keyboard back", () => {
        const shift = new ShiftKey();
        expect(shift.erases("road")).toBe(false);
        shift.follow({shiftKey: true});
        expect(shift.erases("road")).toBe(true);
    });

    it("is up once the page loses the keyboard", () => {
        const shift = new ShiftKey();
        shift.follow({shiftKey: true});
        shift.release();
        expect(shift.erases("road")).toBe(false);
    });
});

describe("the cells a tool's clicks land on", () => {

    it("are the walkway's ninths, three across and down a tile, and every other tool's tiles", () => {
        expect([cellsPerTile("walkway"), cellsPerTile("road"), cellsPerTile("query")]).toEqual([3, 1, 1]);
    });
});

describe("the canvas's cursor", () => {

    it.each<[CursorTool, string]>([["query", "helpPointer"], ["road", "pointer"], ["residential", "pointer"]])(
        "is set by its class for the %s tool", (tool, cursor) => {
        expect(cursorClass(tool, "free")).toBe(cursor);
    });

    // Clearing a tool, the query tool's included, gives the canvas back the cursor it had before any was chosen
    it("is the default while no tool is chosen", () => {
        expect(cursorClass(null, "free")).toBeNull();
    });

    it.each<[CursorTool | null]>([["query"], ["road"], [null]])(
        "is the open hand while a pan is ready, and the closed one while it holds the map, over the %s tool's", (tool) => {
        expect([cursorClass(tool, "ready"), cursorClass(tool, "held")]).toEqual(["grab", "grabbing"]);
    });
});

describe("a tool button", () => {

    it("offers the tool its data-tool names, with the tiles across its outline its data-size gives", () => {
        expect(buttonTool({tool: "airport", size: "6"})).toEqual({name: "airport", width: 6});
        expect(buttonTool({tool: "query", size: "1"})).toEqual({name: "query", width: 1});
    });

    it.each([["no tool", undefined], ["an unknown tool", "lighthouse"], ["a tool's name in capitals", "Road"]])(
        "that names %s fails", (_, tool) => {
        expect(() => buttonTool({tool, size: "1"})).toThrow("A tool button names no tool");
    });

    it.each([["no size", undefined], ["no tiles", "0"], ["part of a tile", "1.5"], ["a word", "big"]])(
        "that gives %s fails", (_, size) => {
        expect(() => buttonTool({tool: "road", size})).toThrow("The road tool's button gives its size as");
    });
});

describe("the tools' outline colours", () => {

    const everyTool = CURSOR_TOOLS.map((tool) => ({tool, colour: `${tool} accent`}));

    it("are each tool's button's accent", () => {
        const colours = toolColours(everyTool);

        expect(colours.road).toBe("road accent");
        expect(colours.query).toBe("query accent");
    });

    it("fail on a page with no button for a tool a player may hold", () => {
        const buttons = everyTool.filter(({tool}) => tool !== "stadium" && tool !== "query");

        expect(() => toolColours(buttons)).toThrow("No tool button offers these tools: stadium, query");
    });
});

describe("Space", () => {

    const space = {key: " ", altKey: false, ctrlKey: false, metaKey: false};

    it("pans the map", () => {
        expect(spacePans(space, false, false)).toBe(true);
    });

    it.each([["while a window holds the input", true, false, {}],
             ["while the element with the focus takes typing", false, true, {}],
             ["with control held", false, false, {ctrlKey: true}], ["with alt held", false, false, {altKey: true}],
             ["with meta held", false, false, {metaKey: true}]])(
        "is left to the page %s", (_, windowHoldsInput, focusTakesTyping, modifiers) => {
        expect(spacePans({...space, ...modifiers}, windowHoldsInput, focusTakesTyping)).toBe(false);
    });

    it("is the only key that pans", () => {
        expect(spacePans({...space, key: "a"}, false, false)).toBe(false);
    });
});

describe("a pan", () => {

    it("is ready while Space is down, holds the map from a press, and lets go as the button comes up", () => {
        const pan = new SpacePan();
        expect(pan.state).toBe("free");

        pan.pressSpace();
        expect(pan.state).toBe("ready");
        expect(pan.pressButton()).toBe(true);
        expect([pan.state, pan.pressPans]).toEqual(["held", true]);
        expect(pan.releaseButton()).toBe(true);
        expect([pan.state, pan.pressPans]).toEqual(["ready", true]);
        expect(pan.releaseSpace()).toBe(false);
        expect(pan.state).toBe("free");
    });

    it("lets go of the map as Space comes up mid-drag, and the press that began it still applies no tool", () => {
        const pan = new SpacePan();
        pan.pressSpace();
        pan.pressButton();

        expect(pan.releaseSpace()).toBe(true);
        expect([pan.state, pan.pressPans]).toEqual(["free", true]);
        expect(pan.releaseButton()).toBe(false);
        expect(pan.pressPans).toBe(true);
    });

    it("waits for a press under way, a tool's drag or click, which applies its tool, until the button comes up", () => {
        const pan = new SpacePan();
        expect(pan.pressButton()).toBe(false);

        pan.pressSpace();
        expect([pan.state, pan.pressPans]).toEqual(["free", false]);
        pan.releaseButton();
        expect(pan.state).toBe("ready");
    });

    it("forgets that a press began a pan at the next press", () => {
        const pan = new SpacePan();
        pan.pressSpace();
        pan.pressButton();
        pan.releaseButton();
        pan.releaseSpace();

        expect(pan.pressButton()).toBe(false);
        expect(pan.pressPans).toBe(false);
    });

    it("lets go of everything as the page loses the keyboard and mouse", () => {
        const pan = new SpacePan();
        pan.pressSpace();
        pan.pressButton();

        expect(pan.releaseAll()).toBe(true);
        expect(pan.state).toBe("free");
        expect(pan.spaceIsDown).toBe(false);
        expect(pan.pressButton()).toBe(false);
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

    // A key held scrolls 0.6 CSS pixels a millisecond, so the times here are multiples of 5 milliseconds, a whole
    // number of pixels, and the tiles exact

    it("scrolls nothing at once for a press, and on at the scroll speed while the key is held", () => {
        const keys = new ScrollKeys();
        keys.press("right", false, 1000);

        expect(keys.take(1000, 16)).toEqual({x: 0, y: 0});
        // 60 pixels, 3 and three quarter tiles
        expect(keys.take(1100, 16)).toEqual({x: 3.75, y: 0});
    });

    // Drives the view as well as the keys, which the view's tests and the controls' each cover half of: the one test of
    // a held key moving the origin as the game moves it, from between tiles to the limit
    it("moves the view's origin by the time held times the speed from between tiles, and stops exactly at the limit",
       () => {
        // 80 tiles across a map of 120, whose limit is 79.5; centred on row 50 with 56 whole tiles down, 50 - 28 = 22
        const view = viewport(1280, 900, 16, 120, 100);
        const position = new ViewPosition(view);
        position.centreOn(60, 50);
        position.scrollBy(0.25, 0);
        expect(position.origin).toEqual({x: 20.25, y: 22});

        const keys = new ScrollKeys();
        keys.press("right", false, 0);
        // A take every 15 milliseconds, as the game's ticks take it: 9 pixels, 0.5625 of a tile, each
        let now = 0;
        for (; now < 300; now += 15) {
            const scroll = keys.take(now, 16);
            position.scrollBy(scroll.x, scroll.y);
        }
        // 285 milliseconds are 171 pixels, 10.6875 tiles, on from 20.25: between tiles, where whole-tile steps would
        // come to 31
        expect(position.origin.x).toBe(30.9375);

        for (; now < 10_000; now += 15) {
            const scroll = keys.take(now, 16);
            position.scrollBy(scroll.x, scroll.y);
        }
        expect(position.origin).toEqual({x: view.maxX, y: 22});
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

        expect(keys.take(5000, 16).x * 16).toBe(SCROLL_SPEED * MAX_SCROLL_TIME / 1000);
    });

    it("scrolls a second's worth for a key event that ends a stall, and the time since for the take after it", () => {
        const keys = new ScrollKeys();
        keys.press("right", false, 0);
        keys.take(0, 16);
        // The first event after the stall counts a second's worth right, 600 pixels, and the take the 10 milliseconds
        // since, left, 6: 594 pixels
        keys.press("left", false, 5000);

        expect(keys.take(5010, 16)).toEqual({x: 37.125, y: 0});
    });

    it("holds a key whose repeated keydown comes before any press", () => {
        // As a key pressed while a window held the keyboard repeats once the window has closed
        const keys = new ScrollKeys();
        keys.press("right", true, 0);

        expect([keys.take(0, 16), keys.take(100, 16)]).toEqual([{x: 0, y: 0}, {x: 3.75, y: 0}]);
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

        // 300 pixels, eighteen and three quarter tiles
        expect(rare.take(500, 16).x).toBe(-18.75);
        expect(tiles).toBeCloseTo(-18.75, 9);
    });

    it("never rounds to whole tiles, carrying nothing from one take to the next", () => {
        const keys = new ScrollKeys();
        keys.press("up", false, 0);
        keys.take(0, 64);

        // 30 pixels each, under half a tile at 64 pixels a tile
        expect([keys.take(50, 64), keys.take(100, 64)]).toEqual([{x: 0, y: -0.46875}, {x: 0, y: -0.46875}]);
    });

    it("scrolls a key let go before any take for the time it was held, and no further", () => {
        const keys = new ScrollKeys();
        keys.press("up", false, 0);
        keys.release("up", 100);

        expect([keys.take(200, 16), keys.take(300, 16)]).toEqual([{x: 0, y: -3.75}, {x: 0, y: 0}]);
    });

    it("scrolls no further for a key's repeated keydown", () => {
        const keys = new ScrollKeys();
        keys.press("up", false, 0);
        keys.take(0, 16);
        keys.press("up", true, 10);
        keys.release("up", 20);

        // The 20 milliseconds held, 12 pixels
        expect([keys.take(30, 16), keys.take(40, 16)]).toEqual([{x: 0, y: -0.75}, {x: 0, y: 0}]);
    });

    it("scrolls along both axes at once", () => {
        const keys = new ScrollKeys();
        keys.press("left", false, 0);
        keys.press("down", false, 0);

        expect(keys.take(100, 16)).toEqual({x: -3.75, y: 3.75});
    });

    it("scrolls the way of the key last pressed of two held along an axis, and on the other's once it is let go", () => {
        const keys = new ScrollKeys();
        keys.press("left", false, 0);
        keys.take(0, 16);
        keys.press("right", false, 0);

        expect(keys.take(100, 16)).toEqual({x: 3.75, y: 0});

        keys.release("right", 100);
        expect(keys.take(150, 16)).toEqual({x: -1.875, y: 0});
    });

    it("scrolls each way for the time it was held between two takes", () => {
        const keys = new ScrollKeys();
        keys.press("left", false, 0);
        keys.take(0, 16);
        // Left for 50 milliseconds, then right for 100
        keys.press("right", false, 50);

        // 60 pixels right less 30 left, 1 and seven eighths tiles
        expect(keys.take(150, 16)).toEqual({x: 1.875, y: 0});
    });

    it("stops every key the page loses the keyboard with, once it has scrolled for the time they were held", () => {
        const keys = new ScrollKeys();
        keys.press("left", false, 0);
        keys.press("up", false, 0);
        keys.take(0, 16);
        keys.releaseAll(5);

        // 3 pixels each way
        expect([keys.take(1000, 16), keys.take(2000, 16)]).toEqual([{x: -0.1875, y: -0.1875}, {x: 0, y: 0}]);
    });
});
