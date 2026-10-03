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
// handler tells the manager the window closed, then may open another.
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
    const followUp = new FakeWindow();
    const state = {budgetDue: false};
    const windows = new WindowManager(budget, () => state.budgetDue, () => [BUDGET_VALUES]);

    for (const window of [budget, other, followUp]) {
        window.onClose = () => windows.closed();
    }

    return {windows, budget, other, followUp, state};
}

describe("the window manager", () => {

    it("holds the input, but not the city, while any window but the budget window shows", () => {
        const {windows, other} = setUp();

        windows.open(other, "data");

        expect(other.opened).toEqual([["data"]]);
        expect(windows.holdsInput()).toBe(true);
        expect(windows.holdsCity()).toBe(false);
    });

    it("holds the city while the budget window shows", () => {
        const {windows, budget} = setUp();

        windows.openBudget();

        expect(budget.opened).toEqual([[BUDGET_VALUES]]);
        expect(windows.holdsInput()).toBe(true);
        expect(windows.holdsCity()).toBe(true);
    });

    it("holds nothing once the window closes", () => {
        const {windows} = setUp();
        windows.openBudget();

        windows.closeShown();

        expect(windows.holdsInput()).toBe(false);
        expect(windows.holdsCity()).toBe(false);
    });

    it("opens no window over another, so one opening unasked can't take the budget window's place", () => {
        const {windows, other} = setUp();
        windows.openBudget();

        windows.open(other);

        expect(other.opened).toEqual([]);
        expect(windows.holdsCity()).toBe(true);
    });

    it("opens a budget that falls due as soon as no window shows", () => {
        const {windows, budget, state} = setUp();
        state.budgetDue = true;

        windows.openDue();

        expect(budget.opened).toEqual([[BUDGET_VALUES]]);
        expect(windows.holdsCity()).toBe(true);
    });

    it("opens a budget that falls due behind a window when that window closes", () => {
        const {windows, budget, other, state} = setUp();
        windows.open(other);
        state.budgetDue = true;

        windows.openDue();
        expect(budget.opened).toEqual([]);

        windows.closeShown();
        windows.openDue();
        expect(budget.opened).toEqual([[BUDGET_VALUES]]);
    });

    it("waits for a window that a closing window opens in its place", () => {
        const {windows, budget, other, followUp, state} = setUp();
        other.onClose = () => {
            windows.closed();
            windows.open(followUp);
        };
        windows.open(other);
        state.budgetDue = true;

        windows.closeShown();
        windows.openDue();
        expect(followUp.opened).toEqual([[]]);
        expect(budget.opened).toEqual([]);

        windows.closeShown();
        windows.openDue();
        expect(budget.opened).toEqual([[BUDGET_VALUES]]);
    });

    it("opens a due budget once, whether the player or the manager opens it first", () => {
        const {windows, budget, state} = setUp();
        state.budgetDue = true;

        windows.openBudget();
        windows.openDue();

        expect(budget.opened).toHaveLength(1);
    });

    it("opens no budget that isn't due", () => {
        const {windows, budget} = setUp();

        windows.openDue();

        expect(budget.opened).toEqual([]);
        expect(windows.holdsInput()).toBe(false);
    });
});
