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

import { recordRun } from "../conformance/cityRuns";
import { cityFromSeed, Level, SaveData, Speed } from "../headless/city";
import { RUN_STEPS } from "../headless/fixtures/fixture";
import { builtSave } from "../headless/runner";
import * as Messages from "../src/messages";
import { stateHash } from "../src/stateHash";

describe("a city run", () => {

    it("checks the state hash as the city starts, after each interval and at its last step", async () => {
        const run = await recordRun({fixture: "suburb", built: await builtSave("suburb")}, "fast", 40, 16);

        expect(run.checkpoints.map((checkpoint) => checkpoint.step)).toEqual([0, 16, 32, 40]);
    });

    it("of a new city checks the city as constructed, its first scans included", async () => {
        const run = await recordRun({seed: 3, level: "hard"}, "slow", 1, 1);

        expect(run.checkpoints[0].hash).toBe(await stateHash(cityFromSeed(3, Level.hard, Speed.slow)));
    });

    it("names the level its city is at", async () => {
        expect((await recordRun({seed: 3, level: "hard"}, "slow", 1, 1)).level).toBe("hard");
        expect((await recordRun({fixture: "suburb", built: await builtSave("suburb")}, "slow", 1, 1)).level).toBe("easy");
    });

    // A loaded city announces its date at its first step, which runs no phase at slow speed
    it("tags each event with the step during which it came", async () => {
        const run = await recordRun({fixture: "suburb", built: await builtSave("suburb")}, "slow", 3, 3);

        expect(run.events).toEqual([{step: 0, name: Messages.DATE_UPDATED, payload: {month: 0, year: 1900}}]);
    });

    // The suburb's funds pay its upkeep every year; the broke suburb's can't at its first year end, so auto-budget turns
    // itself off, and the years after it are budgeted with it off
    it("notes each year's budget, as auto-budget paid it, ran short of it, or was off", async () => {
        const paid = await recordRun({fixture: "suburb", built: await builtSave("suburb")}, "fast", RUN_STEPS, RUN_STEPS);
        const broke = await recordRun({fixture: "suburbBroke", built: await builtSave("suburbBroke")}, "fast", RUN_STEPS,
                                      RUN_STEPS);

        expect(paid.budgets).toEqual(Array(paid.yearEnds).fill({autoBudget: true, shortfall: false}));
        expect(broke.budgets).toEqual([
            {autoBudget: true, shortfall: true},
            ...Array(broke.yearEnds - 1).fill({autoBudget: false, shortfall: false}),
        ]);
        expect(paid.yearEnds).toBeGreaterThan(1);
    });

    // The town sends out trains and aircraft over its run; the suburb, without rail or an airport, sends out nothing
    it("notes whether the city had sprites moving", async () => {
        const town = await recordRun({fixture: "town", built: await builtSave("town")}, "medium", RUN_STEPS, RUN_STEPS);
        const suburb = await recordRun({fixture: "suburb", built: await builtSave("suburb")}, "fast", 40, 40);

        expect([town.sprites, suburb.sprites]).toEqual([true, false]);
    });

    it("notes whether random disasters could strike the city", async () => {
        const save = await builtSave("suburb") as SaveData & {disasters: {disastersEnabled: boolean}};
        save.disasters.disastersEnabled = true;

        const enabled = await recordRun({fixture: "suburb", built: save}, "fast", 1, 1);
        const disabled = await recordRun({fixture: "suburb", built: await builtSave("suburb")}, "fast", 1, 1);

        expect([enabled.disasters, disabled.disasters]).toEqual([true, false]);
    });
});
