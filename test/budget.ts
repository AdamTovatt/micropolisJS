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

import { Budget } from "../src/budget.js";
import { FundingChoice } from "../src/fundingChoice";

type BudgetInstance = InstanceType<typeof Budget>;

// Percentages a slider can't hold exactly: the fire department's was scaled back to the cash the budget had, so it has
// a fraction of a percent that a whole slider position would drop
const held = { road: 0.57, fire: Math.fround(140 / 300), police: 0.05 };

// A budget with the given funds and taxes, the given maintenance costs, and the held percentages
function budgetWith(funds: number, taxes: number, maintenance = { road: 100, fire: 300, police: 200 }): BudgetInstance {
    const budget = new Budget();
    budget.totalFunds = funds;
    budget.taxFund = taxes;
    budget.roadMaintenanceBudget = maintenance.road;
    budget.fireMaintenanceBudget = maintenance.fire;
    budget.policeMaintenanceBudget = maintenance.police;
    budget.setFunding(held);
    return budget;
}

function percentsOf(budget: BudgetInstance) {
    return { road: budget.roadPercent, fire: budget.firePercent, police: budget.policePercent };
}

describe("Budget.setFunding", () => {

    it("should set only the percentages given", () => {
        const budget = budgetWith(0, 0);
        budget.setFunding({ fire: 0.8 });

        expect(percentsOf(budget)).toEqual({ ...held, fire: 0.8 });
    });
});

// What Game.handleBudgetWindowClosure applies when the player presses OK without moving a slider. This covers the
// budget's side; the window's own wiring, which sends FundingChoice.changes(), has no DOM to run in under these tests.
describe("A budget given the funding of a window the player moved no slider in", () => {

    const untouched = () => new FundingChoice(held).changes();

    it("should keep every percentage during the year", () => {
        const budget = budgetWith(20000, 500);

        budget.setFunding(untouched());
        budget.updateFundEffects();

        expect(percentsOf(budget)).toEqual(held);
    });

    it("should keep every percentage at a year-end budget with cash for every service", () => {
        const budget = budgetWith(20000, 500);

        budget.setFunding(untouched());
        budget.doBudgetWindow();

        expect(percentsOf(budget)).toEqual(held);
    });
});

describe("A year-end budget short of cash", () => {

    it("should charge what it has and scale back the percentages of the services it can't fully fund", () => {
        // $150 pays the $57 of roads and $93 of the fire department's $140; police goes unpaid
        const budget = budgetWith(50, 100);
        budget.doBudgetWindow();

        expect(budget.totalFunds).toBe(0);
        expect(percentsOf(budget)).toEqual({ road: 0.57, fire: Math.fround(93 / 300), police: 0 });
    });
});
