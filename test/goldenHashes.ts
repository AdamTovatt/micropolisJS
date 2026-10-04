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

import { fixtureNames } from "../headless/fixtures/index";
import { fixtureLog, replay } from "../headless/runner";
import { Simulation } from "../headless/city";
import { savedState } from "../src/stateHash";

// Each fixture's golden hashes are its log's checkpoints: the built hash at step 0, of the city once the log's
// commands have built it, which is the hash of its exported state, and the run hash after a fixed run at the speed
// the log's city starts at
describe("the golden hashes", () => {

    it.each(fixtureNames())("pin %s as built and after a run", (name) => {
        const steps = fixtureLog(name).checkpoints.map((checkpoint) => checkpoint.step);

        expect(steps[0]).toBe(0);
        expect(steps.length).toBeGreaterThan(1);
    });

    it.each(fixtureNames())("hold for %s", async (name) => {
        await expect(replay(fixtureLog(name)).verified).resolves.toBe(fixtureLog(name).checkpoints.length);
    });
});

// What each budget fixture is there for, which its hashes can't show: a rule change that moves them could also stop
// the fixture reaching the rule it pins
describe("the budget fixtures", () => {

    // A year at medium speed: 48 cycles of 16 phases, a phase every third step
    const YEAR = 48 * 16 * 3;

    interface SavedBudget {
        autoBudget: boolean;
        cityTax: number;
        totalFunds: number;
        roadPercent: number;
        firePercent: number;
        policePercent: number;
        fireMaintenanceBudget: number;
        policeMaintenanceBudget: number;
    }

    const budgetOf = (city: Simulation) => (savedState(city) as {budget: SavedBudget}).budget;

    const shares = (budget: SavedBudget) => [budget.roadPercent, budget.firePercent, budget.policePercent];

    it("keep underfunded's services at the shares the player chose through every year end", () => {
        const {city} = replay(fixtureLog("underfunded"), {verify: false});
        const budget = budgetOf(city);

        expect(city.getDate().year).toBe(1903);
        expect([budget.fireMaintenanceBudget, budget.policeMaintenanceBudget]).toEqual([100, 100]);
        // Each share is kept in float, as the original's sliders keep it
        expect([budget.autoBudget, ...shares(budget)])
            .toEqual([false, Math.fround(0.6), Math.fround(0.4), Math.fround(0.75)]);
    });

    it("keep suburbUnderfunded's services at the shares the player chose through every year end", () => {
        const budget = budgetOf(replay(fixtureLog("suburbUnderfunded"), {verify: false}).city);

        expect([budget.autoBudget, ...shares(budget)])
            .toEqual([false, Math.fround(0.6), Math.fround(0.4), Math.fround(0.75)]);
    });

    it("leave suburbBroke short at its first year end, paying fire with what is left, and turn auto-budget off", () => {
        const log = fixtureLog("suburbBroke");
        const built = budgetOf(replay(log, {to: 0, verify: false}).city);
        const budget = budgetOf(replay(log, {to: YEAR, verify: false}).city);

        expect([built.autoBudget, built.cityTax]).toEqual([true, 0]);
        expect([budget.autoBudget, budget.totalFunds, budget.roadPercent, budget.policePercent]).toEqual([false, 0, 1, 0]);
        expect(budget.firePercent).toBeGreaterThan(0);
        expect(budget.firePercent).toBeLessThan(1);
    });

    it("leave broke short at its first year end, paying police with what is left, and turn auto-budget off", () => {
        const log = fixtureLog("broke");
        const built = budgetOf(replay(log, {to: 0, verify: false}).city);
        const budget = budgetOf(replay(log, {to: YEAR, verify: false}).city);

        expect([built.autoBudget, built.cityTax]).toEqual([true, 0]);
        expect([budget.autoBudget, budget.totalFunds, budget.roadPercent, budget.firePercent]).toEqual([false, 0, 1, 1]);
        expect(budget.policePercent).toBeGreaterThan(0);
        expect(budget.policePercent).toBeLessThan(1);
    });
});
