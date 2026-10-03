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

import * as Messages from "../src/messages";
import { BarElement, NotificationBar, notificationView } from "../src/notification";

describe("a notification's view", () => {

    it("shows the message's text in its tone", () => {
        expect(notificationView({subject: Messages.HIGH_POLLUTION}))
            .toEqual({text: "Pollution very high", tone: "bad", link: null});
    });

    it("links to the place a message happened", () => {
        expect(notificationView({subject: Messages.FIRE_REPORTED, data: {x: 31, y: 61}}))
            .toEqual({text: "Fire reported ", tone: "bad", link: {x: 31, y: 61}});
    });

    // The simulation wraps a message it sends without a place in data that is undefined
    it.each([
        ["data left undefined", {subject: Messages.WELCOME, data: undefined}],
        ["data without a y", {subject: Messages.WELCOME, data: {x: 4}}],
    ])("is no link with %s", (_, message) => {
        expect(notificationView(message).link).toBeNull();
    });
});

// The bar's element, which shows unless its display is "none", as the stylesheet lays it out. It starts with the class
// the page gives it.
function barElement() {
    const classes = new Set(["neutral"]);
    let click: (e: {preventDefault(): void}) => void = () => {};

    const element: BarElement = {
        textContent: "",
        style: {display: ""},
        getClientRects: () => ({length: element.style.display === "none" ? 0 : 1}),
        classList: {
            add: (token) => {
                classes.add(token);
            },
            remove: (...tokens) => tokens.forEach((token) => classes.delete(token)),
            toggle: (token, force) => {
                if (force) {
                    classes.add(token);
                } else {
                    classes.delete(token);
                }
                return force;
            },
        },
        addEventListener: (_, listener) => {
            click = listener;
        },
    };

    return {element, classes: () => Array.from(classes).sort(), click: () => click({preventDefault: () => {}})};
}

describe("the notification bar", () => {

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function bar() {
        const element = barElement();
        const centred: {x: number, y: number}[] = [];
        const notifications = new NotificationBar(element.element, {centreOn: (x, y) => centred.push({x, y})});
        return {...element, centred, bar: notifications};
    }

    it("starts hidden", () => {
        const {element} = bar();

        expect(element.style.display).toBe("none");
    });

    it("shows a message's text in its tone alone", () => {
        const {bar: notifications, element, classes} = bar();

        notifications.show({subject: Messages.REACHED_TOWN});

        expect([element.textContent, element.style.display, classes()])
            .toEqual(["Now a town! Population has reached 2,000", "", ["good"]]);
    });

    it("centres the map on a linked message's place when clicked, and is a pointer", () => {
        const {bar: notifications, classes, click, centred} = bar();

        notifications.show({subject: Messages.FIRE_REPORTED, data: {x: 31, y: 61}});
        click();

        expect([classes(), centred]).toEqual([["bad", "pointer"], [{x: 31, y: 61}]]);
    });

    it("centres nothing when clicked on a message without a place", () => {
        const {bar: notifications, classes, click, centred} = bar();

        notifications.show({subject: Messages.FIRE_REPORTED, data: {x: 31, y: 61}});
        notifications.show({subject: Messages.NEED_AIRPORT});
        click();

        expect([classes(), centred]).toEqual([["neutral"], []]);
    });

    it("hides 30 seconds after the latest message", () => {
        const {bar: notifications, element} = bar();

        notifications.show({subject: Messages.WELCOME});
        jest.advanceTimersByTime(20 * 1000);
        notifications.show({subject: Messages.NEED_AIRPORT});
        jest.advanceTimersByTime(29 * 1000);
        const shownAt29 = element.style.display;
        jest.advanceTimersByTime(1000);

        expect([shownAt29, element.style.display]).toEqual(["", "none"]);
    });
});
