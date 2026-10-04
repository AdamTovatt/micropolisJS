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

import { GameWindow, WindowManager } from "../src/windowManager";

// A window that records what it was opened with. Closing it runs onClose, as the game's closed handler does: the
// handler tells the manager the window closed.
class FakeWindow implements GameWindow {
    opened: unknown[][] = [];
    onClose: () => void = () => {};

    open(...args: unknown[]): void {
        this.opened.push(args);
    }

    close(): void {
        this.onClose();
    }
}

const BUDGET_VALUES = {taxRate: 7};

function setUp() {
    const budget = new FakeWindow();
    const other = new FakeWindow();
    const windows = new WindowManager(budget, () => [BUDGET_VALUES]);

    for (const window of [budget, other]) {
        window.onClose = () => windows.closed();
    }

    return {windows, budget, other};
}

describe("the window manager", () => {

    it("holds the input while a window shows", () => {
        const {windows, other} = setUp();

        windows.open(other, "data");

        expect(other.opened).toEqual([["data"]]);
        expect(windows.holdsInput()).toBe(true);
    });

    it("opens the budget window with the budget's values", () => {
        const {windows, budget} = setUp();

        windows.openBudget();

        expect(budget.opened).toEqual([[BUDGET_VALUES]]);
        expect(windows.holdsInput()).toBe(true);
    });

    it("holds nothing once the window closes", () => {
        const {windows} = setUp();
        windows.openBudget();

        windows.closeShown();

        expect(windows.holdsInput()).toBe(false);
    });

    it("opens no window over another", () => {
        const {windows, other} = setUp();
        windows.openBudget();

        windows.open(other);

        expect(other.opened).toEqual([]);
    });
});
