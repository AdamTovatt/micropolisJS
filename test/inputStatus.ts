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

import { heldKey, isToolPress } from "../src/inputStatus";

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
