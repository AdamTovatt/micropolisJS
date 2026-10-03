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
    budget.roadPercent = held.road;
    budget.firePercent = held.fire;
    budget.policePercent = held.police;
    return budget;
}

function percentsOf(budget: BudgetInstance) {
    return { road: budget.roadPercent, fire: budget.firePercent, police: budget.policePercent };
}

describe("A year-end budget with cash for every service", () => {

    it("should keep every percentage", () => {
        const budget = budgetWith(20000, 500);
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
