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

import { Outcome } from "../src/protocol";
import { Text } from "../src/text";
import { TOAST_MS, Toast, ToastElement, toastedFailure, toastPosition } from "../src/toolToast";
import { styledBy } from "./helpers/stylingWindow";

describe("the failure the tool toast tells of", () => {

    // A failed tile is routine in a drag that builds: its first tile is often built already
    it.each([
        ["ok", null],
        ["failed", null],
        ["needsBulldoze", "needsBulldoze"],
        ["noMoney", "noMoney"],
        ["rejected", "rejected"],
    ] as const)("for an outcome of %s is %p", (outcome: Outcome, failure) => {
        expect(toastedFailure(outcome)).toBe(failure);
    });

    it("is none for a result that tells of no tool command of the player's", () => {
        expect(toastedFailure(null)).toBeNull();
    });
});

describe("the tool toast's text", () => {

    it.each([
        ["needsBulldoze", "Area must be bulldozed first"],
        ["noMoney", "Insufficient funds to build that"],
        ["rejected", "That can't be done here"],
    ] as const)("for an outcome of %s is %p", (failure, text) => {
        expect(Text.toolFailures[failure]).toBe(text);
    });
});

describe("where the tool toast shows", () => {

    const PAGE = {width: 1000, height: 800};
    const TOAST = {width: 200, height: 30};

    it("is right of and below the pointer", () => {
        expect(toastPosition({x: 300, y: 400}, TOAST, PAGE)).toEqual({x: 316, y: 416});
    });

    it("is moved back inside the page where it would cross the page's right or bottom edge", () => {
        expect(toastPosition({x: 990, y: 790}, TOAST, PAGE)).toEqual({x: 792, y: 762});
    });

    it("keeps its left and top edges on the page when it is wider or taller than the page leaves room for", () => {
        expect(toastPosition({x: 50, y: 50}, {width: 2000, height: 1000}, PAGE)).toEqual({x: 8, y: 8});
    });
});

type FakeToast = ToastElement<FakeToast>;

// The toast's element, which the stylesheet lays out as a block, with the size its text gives it. laidOut is the
// animation the element had each time its size was read, which lays the page out.
function toastElement() {
    const laidOut: string[] = [];
    const style = {display: "", left: "", top: "", animationName: "", animationDuration: ""};
    const element: FakeToast = {
        textContent: "",
        style,
        ownerDocument: styledBy("block"),
        get offsetWidth() {
            laidOut.push(style.animationName);
            return 120;
        },
        offsetHeight: 24,
    };

    return {element, laidOut, shows: () => element.style.display !== "none"};
}

describe("the tool toast", () => {

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const page = () => ({width: 1000, height: 800});

    it("shows nothing until it is shown a text, and fades over its whole time", () => {
        const {element, shows} = toastElement();
        new Toast(element, page);

        expect([shows(), element.style.animationDuration]).toEqual([false, `${TOAST_MS}ms`]);
    });

    it("shows the text beside the pointer, with the stylesheet's fade", () => {
        const {element, shows} = toastElement();
        const toast = new Toast(element, page);

        toast.show("Area must be bulldozed first", {x: 300, y: 400});

        expect([shows(), element.textContent, element.style.animationName])
            .toEqual([true, "Area must be bulldozed first", ""]);
        expect([element.style.left, element.style.top]).toEqual(["316px", "416px"]);
    });

    it("hides once its time is up", () => {
        const {element, shows} = toastElement();
        const toast = new Toast(element, page);
        toast.show("Area must be bulldozed first", {x: 300, y: 400});

        jest.advanceTimersByTime(TOAST_MS - 1);
        const before = shows();
        jest.advanceTimersByTime(1);

        expect([before, shows()]).toEqual([true, false]);
    });

    // The page is laid out without the animation, so the fade starts again when the stylesheet's is given back
    it("replaces the toast showing with a new one, which fades from the start and shows for its own time", () => {
        const {element, laidOut, shows} = toastElement();
        const toast = new Toast(element, page);
        toast.show("That can't be done here", {x: 300, y: 400});
        jest.advanceTimersByTime(TOAST_MS - 100);

        toast.show("Insufficient funds to build that", {x: 500, y: 100});
        const replaced = [shows(), element.textContent, element.style.left, element.style.animationName];
        jest.advanceTimersByTime(TOAST_MS - 1);

        expect(replaced).toEqual([true, "Insufficient funds to build that", "516px", ""]);
        expect(laidOut).toEqual(["none", "none"]);
        expect(shows()).toBe(true);
    });

    it("hides at once when dismissed, leaving no timer behind", () => {
        const {element, shows} = toastElement();
        const toast = new Toast(element, page);
        toast.show("That can't be done here", {x: 300, y: 400});

        toast.dismiss();

        expect(shows()).toBe(false);
        expect(jest.getTimerCount()).toBe(0);
    });
});
