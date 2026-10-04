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
import { WELCOME } from "../src/uiMessages";
import { styledBy } from "./helpers/stylingWindow";

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
        ["data left undefined", {subject: Messages.HIGH_POLLUTION, data: undefined}],
        ["data without a y", {subject: Messages.HIGH_POLLUTION, data: {x: 4}}],
    ])("is no link with %s", (_, message) => {
        expect(notificationView(message).link).toBeNull();
    });
});

type FakeBar = BarElement<FakeBar>;

// The bar's element, which the stylesheet lays out as a block. It starts with the class the page gives it.
function barElement() {
    const classes = new Set(["neutral"]);
    let click: (e: {preventDefault(): void}) => void = () => {};

    const element: FakeBar = {
        style: {display: ""},
        ownerDocument: styledBy("block"),
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
        const text = {textContent: null as string | null};
        const goThere = barElement().element;
        const centred: {x: number, y: number}[] = [];
        const notifications = new NotificationBar({bar: element.element, text, goThere},
                                                  {centreOn: (x, y) => centred.push({x, y})});
        return {...element, text, goThere, centred, bar: notifications};
    }

    it("says Go there beside a message with a place, and not beside one without or an offer", () => {
        const {bar: notifications, goThere} = bar();

        notifications.show({subject: Messages.FIRE_REPORTED, data: {x: 31, y: 61}});
        const linked = goThere.style.display;
        notifications.show({subject: Messages.NEED_AIRPORT});
        const unlinked = goThere.style.display;
        notifications.dismiss();
        notifications.offer({subject: Messages.FIRE_REPORTED, data: {x: 31, y: 61}}, () => true);

        expect([linked, unlinked, goThere.style.display]).toEqual(["", "none", "none"]);
    });

    it("starts hidden", () => {
        const {element} = bar();

        expect(element.style.display).toBe("none");
    });

    it("shows a message's text in its tone alone", () => {
        const {bar: notifications, element, text, classes} = bar();

        notifications.show({subject: Messages.REACHED_TOWN});

        expect([text.textContent, element.style.display, classes()])
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

    it("offers an action under a message without a place, and is a pointer", () => {
        const {bar: notifications, element, text, classes} = bar();

        notifications.offer({subject: Messages.BUDGET_REVIEW_DUE}, () => true);

        expect([text.textContent, element.style.display, classes()])
            .toEqual(["Year-end budget ready: click to review", "", ["neutral", "pointer"]]);
    });

    it("runs an offer's action when clicked, in place of centring on its message's place", () => {
        const {bar: notifications, click, centred} = bar();
        let runs = 0;

        notifications.offer({subject: Messages.FIRE_REPORTED, data: {x: 31, y: 61}}, () => ++runs > 0);
        click();

        expect([runs, centred]).toEqual([1, []]);
    });

    it("hides once an offer's action was done, leaving no timer behind", () => {
        const {bar: notifications, element, click} = bar();

        notifications.offer({subject: Messages.BUDGET_REVIEW_DUE}, () => true);
        click();

        expect([element.style.display, jest.getTimerCount()]).toEqual(["none", 0]);
    });

    it("stays shown when an offer's action wasn't done", () => {
        const {bar: notifications, element, click} = bar();

        notifications.offer({subject: Messages.BUDGET_REVIEW_DUE}, () => false);
        click();

        expect(element.style.display).toBe("");
    });

    it("takes no message's place with an offer", () => {
        const {bar: notifications, text, click} = bar();
        let runs = 0;

        notifications.show({subject: Messages.NO_MONEY});
        notifications.offer({subject: Messages.BUDGET_REVIEW_DUE}, () => ++runs > 0);
        click();

        expect([text.textContent, runs]).toEqual(["YOUR CITY HAS GONE BROKE", 0]);
    });

    it("offers once the message before has hidden", () => {
        const {bar: notifications, element, text} = bar();

        notifications.show({subject: Messages.NEED_AIRPORT});
        jest.advanceTimersByTime(30 * 1000);
        notifications.offer({subject: Messages.BUDGET_REVIEW_DUE}, () => true);

        expect([text.textContent, element.style.display])
            .toEqual(["Year-end budget ready: click to review", ""]);
    });

    it("runs no earlier offer's action when clicked on news", () => {
        const {bar: notifications, classes, click} = bar();
        let runs = 0;

        notifications.offer({subject: Messages.BUDGET_REVIEW_DUE}, () => ++runs > 0);
        notifications.show({subject: Messages.NEED_AIRPORT});
        click();

        expect([runs, classes()]).toEqual([0, ["neutral"]]);
    });

    it("stays shown when clicked on a message with a place", () => {
        const {bar: notifications, element, click} = bar();

        notifications.show({subject: Messages.FIRE_REPORTED, data: {x: 31, y: 61}});
        click();

        expect(element.style.display).toBe("");
    });

    it("hides 30 seconds after the latest message", () => {
        const {bar: notifications, element} = bar();

        notifications.show({subject: WELCOME});
        jest.advanceTimersByTime(20 * 1000);
        notifications.show({subject: Messages.NEED_AIRPORT});
        jest.advanceTimersByTime(29 * 1000);
        const shownAt29 = element.style.display;
        jest.advanceTimersByTime(1000);

        expect([shownAt29, element.style.display]).toEqual(["", "none"]);
    });

    it("hides at once when dismissed, leaving no timer behind", () => {
        const {bar: notifications, element} = bar();

        notifications.show({subject: WELCOME});
        notifications.dismiss();

        expect([element.style.display, jest.getTimerCount()]).toEqual(["none", 0]);
    });
});
