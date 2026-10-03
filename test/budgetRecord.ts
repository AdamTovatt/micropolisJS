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

import { budgetRecord, type BudgetSource } from "../src/budgetRecord";
import { applyCommand, buildCity, SimulationInstance, YEAR } from "./helpers/simulations";

describe("the budget record", () => {

    // A city a year old, which has collected taxes and has maintenance to pay, with its fire department funded at 40%
    // and its roads at a fraction of a percent
    let city: SimulationInstance;
    const ROAD_FUNDING = Math.fround(94 / 300);

    beforeAll(() => {
        city = buildCity(2026, 7);
        for (let i = 0; i < YEAR; i++) {
            city.step();
        }
        applyCommand(city, {type: "setBudget", fire: 40, tax: 9});
        // Stands in for a year end that had $94 of the $300 the roads wanted, which scales their funding back to that
        // fraction: reaching it by running the city is long and depends on the map
        city.budget.roadPercent = ROAD_FUNDING;
    });

    it("is of a city with taxes, funds and road maintenance to show", () => {
        const budget = city.budget;

        expect(budget.taxFund).toBeGreaterThan(0);
        expect(budget.totalFunds).toBeGreaterThan(0);
        expect(budget.roadMaintenanceBudget).toBeGreaterThan(0);
    });

    it("holds the budget's figures", () => {
        const budget = city.budget;

        expect(city.budgetRecord()).toEqual({
            type: "budget",
            taxRate: 9,
            taxesCollected: budget.taxFund,
            funds: budget.totalFunds,
            maintenance: {
                road: budget.roadMaintenanceBudget, fire: budget.fireMaintenanceBudget,
                police: budget.policeMaintenanceBudget,
            },
            funding: {road: ROAD_FUNDING, fire: Math.fround(0.4), police: 1},
        });
    });

    // budget.js builds new figures on each call, so a budget that hands out the same objects each time shows whether
    // the record copies them
    it("is a copy, so changing it changes nothing in the budget", () => {
        const maintenance = {road: 108, fire: 300, police: 200};
        const percents = {road: 1, fire: 0.5, police: 0.75};
        const budget: BudgetSource = {
            cityTax: 7, taxFund: 186, totalFunds: 4703, maintenance: () => maintenance, percents: () => percents,
        };
        const record = budgetRecord(budget);

        record.maintenance.road = 1;
        record.funding.fire = 0;

        expect(budgetRecord(budget)).toEqual({
            type: "budget", taxRate: 7, taxesCollected: 186, funds: 4703,
            maintenance: {road: 108, fire: 300, police: 200}, funding: {road: 1, fire: 0.5, police: 0.75},
        });
    });
});
