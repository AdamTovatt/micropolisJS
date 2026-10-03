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

// What those cost a year on the maintenance costs below: $57 of $100, $140 of $300 and $10 of $200
const heldCosts = { road: 57, fire: 140, police: 10 };

// A budget with the given funds and taxes, maintenance costs of $100 for roads, $300 for the fire department and $200
// for police, and the held percentages
function budgetWith(funds: number, taxes: number): BudgetInstance {
    const budget = new Budget();
    budget.totalFunds = funds;
    budget.taxFund = taxes;
    budget.roadMaintenanceBudget = 100;
    budget.fireMaintenanceBudget = 300;
    budget.policeMaintenanceBudget = 200;
    budget.roadPercent = held.road;
    budget.firePercent = held.fire;
    budget.policePercent = held.police;
    return budget;
}

function percentsOf(budget: BudgetInstance) {
    return { road: budget.roadPercent, fire: budget.firePercent, police: budget.policePercent };
}

function spendsOf(budget: BudgetInstance) {
    return { road: budget.roadSpend, fire: budget.fireSpend, police: budget.policeSpend };
}

function effectsOf(budget: BudgetInstance) {
    return { road: budget.roadEffect, fire: budget.fireEffect, police: budget.policeEffect };
}

describe("Budget.setFunding", () => {

    it("should fund each service given as the original's slider handler does, and set the effects from the spends", () => {
        const budget = budgetWith(0, 0);
        budget.setFunding({ road: 50, fire: 53, police: 30 });

        // Each percentage is the whole percent / 100 in float, and each spend (maintenance * whole percent) / 100 in
        // integers: (100 * 50) / 100, (300 * 53) / 100 and (200 * 30) / 100
        expect(percentsOf(budget)).toEqual({ road: 0.5, fire: Math.fround(0.53), police: Math.fround(0.3) });
        expect(spendsOf(budget)).toEqual({ road: 50, fire: 159, police: 60 });
        // 32 * 50 / 100 is 16, 1000 * 159 / 300 is 530, and 1000 * 60 / 200 is 300
        expect(effectsOf(budget)).toEqual({ road: 16, fire: 530, police: 300 });
    });

    it("should leave the percentages and spends of the services not given as they are", () => {
        const budget = budgetWith(0, 0);
        budget.setFunding({ fire: 53 });

        expect(percentsOf(budget)).toEqual({ ...held, fire: Math.fround(0.53) });
        expect(spendsOf(budget)).toEqual({ road: 0, fire: 159, police: 0 });
    });
});

describe("Budget.updateFundEffects", () => {

    it("should set each service's effect from the spend booked on it, not from its percentage", () => {
        const budget = budgetWith(0, 0);
        budget.roadSpend = 25;
        budget.fireSpend = 300;
        budget.policeSpend = 50;
        budget.updateFundEffects();

        // 32 * 25 / 100 is 8, 1000 * 300 / 300 is 1000, and 1000 * 50 / 200 is 250
        expect(effectsOf(budget)).toEqual({ road: 8, fire: 1000, police: 250 });
    });

    it("should give a service that costs nothing its full effect", () => {
        const budget = budgetWith(0, 0);
        budget.policeMaintenanceBudget = 0;
        budget.updateFundEffects();

        expect(budget.policeEffect).toBe(1000);
    });
});

describe("Budget.forecast", () => {

    it("should forecast the sliders moved at their whole percents, and the others at the percentages they have", () => {
        const budget = budgetWith(1000, 0);

        expect(budget.forecast({ fire: 80 }).wanted).toEqual({ ...heldCosts, fire: 240 });
    });
});

// A budget whose year end autobudget paid with roads at 50% and the other services in full: the spends are each
// service's full maintenance cost, but the road effect is still the one its 50% funding set, 32 * 50 / 100
function afterAutobudgetAtHalfRoads(): BudgetInstance {
    const budget = budgetWith(20000, 500);
    budget.setFunding({ road: 50, fire: 100, police: 100 });
    budget.doBudgetNow(false);
    return budget;
}

describe("A year-end autobudget with cash for every service", () => {

    it("should charge what the services cost, book their full maintenance costs, and leave the effects alone", () => {
        const budget = afterAutobudgetAtHalfRoads();

        expect(budget.totalFunds).toBe(20500 - (50 + 300 + 200));
        expect(spendsOf(budget)).toEqual({ road: 100, fire: 300, police: 200 });
        expect(effectsOf(budget)).toEqual({ road: 16, fire: 1000, police: 1000 });
    });
});

// What Game.handleBudgetWindowClosure applies when the player presses OK without moving a slider: the window sends
// no funding. This covers the budget's side; the window's own wiring has no DOM to run in under these tests.
describe("A budget given the funding of a window the player moved no slider in", () => {

    const untouched = {};

    it("should keep every percentage", () => {
        const budget = budgetWith(20000, 500);
        budget.setFunding(untouched);

        expect(percentsOf(budget)).toEqual(held);
    });

    it("should keep every spend and effect, even where the spend booked isn't what the effect was set from", () => {
        const budget = afterAutobudgetAtHalfRoads();
        budget.setFunding(untouched);

        expect(spendsOf(budget)).toEqual({ road: 100, fire: 300, police: 200 });
        expect(effectsOf(budget)).toEqual({ road: 16, fire: 1000, police: 1000 });
    });
});

describe("A year-end budget with the player's values", () => {

    it("should book what each service gets as its spend, and set the effects from it", () => {
        const budget = budgetWith(20000, 500);
        budget.doBudgetWindow();

        expect(budget.totalFunds).toBe(20500 - (57 + 140 + 10));
        expect(spendsOf(budget)).toEqual(heldCosts);
        // 32 * 57 / 100 is 18, 1000 * 140 / 300 is 466, and 1000 * 10 / 200 is 50, each rounded down
        expect(effectsOf(budget)).toEqual({ road: 18, fire: 466, police: 50 });
    });
});

describe("A year-end budget short of cash", () => {

    it("should charge what it has and scale back the percentages of the services it can't fully fund", () => {
        // $150 pays the $57 of roads and $93 of the fire department's $140; police goes unpaid
        const budget = budgetWith(50, 100);
        budget.doBudgetWindow();

        expect(budget.totalFunds).toBe(0);
        expect(percentsOf(budget)).toEqual({ road: 0.57, fire: Math.fround(93 / 300), police: 0 });
        expect(spendsOf(budget)).toEqual({ road: 57, fire: 93, police: 0 });
        // 32 * 57 / 100 is 18, rounded down, 1000 * 93 / 300 is 310, and police gets nothing
        expect(effectsOf(budget)).toEqual({ road: 18, fire: 310, police: 0 });
    });
});
