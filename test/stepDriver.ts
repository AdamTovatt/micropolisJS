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

import { MAX_STEPS_PER_CALL, STEPS_PER_SECOND, StepDriver } from "../src/stepDriver";

const STEP = 1000 / STEPS_PER_SECOND;

describe("the step driver", () => {

    it("owes no steps at its first call", () => {
        expect(new StepDriver().stepsDue(5000)).toBe(0);
    });

    it("steps at a fixed rate, whatever the frame times", () => {
        const driver = new StepDriver();
        driver.stepsDue(0);
        let steps = 0;

        for (const now of [7, 30, 31, 95, 400, 1000]) {
            steps += driver.stepsDue(now);
        }

        expect(steps).toBe(STEPS_PER_SECOND);
    });

    it("steps at a fixed rate over fractional frame times", () => {
        const driver = new StepDriver();
        driver.stepsDue(0);
        let steps = 0;

        // 60 frames of 16.7 ms: just over a second
        for (let frame = 1; frame <= 60; frame++) {
            steps += driver.stepsDue(frame * 16.7);
        }

        expect(steps).toBe(STEPS_PER_SECOND);
    });

    it("catches a slow frame up with several steps", () => {
        const driver = new StepDriver();
        driver.stepsDue(0);

        expect(driver.stepsDue(5 * STEP + 1)).toBe(5);
    });

    it("carries a part step over to the next call", () => {
        const driver = new StepDriver();
        driver.stepsDue(0);

        expect(driver.stepsDue(STEP / 2)).toBe(0);
        expect(driver.stepsDue(STEP + 1)).toBe(1);
    });

    it("runs every step owed when they come to exactly its cap", () => {
        const driver = new StepDriver();
        driver.stepsDue(0);

        expect(driver.stepsDue(MAX_STEPS_PER_CALL * STEP + STEP / 2)).toBe(MAX_STEPS_PER_CALL);
        expect(driver.stepsDue(MAX_STEPS_PER_CALL * STEP + STEP + 1)).toBe(1);
    });

    it("drops what a long gap owes past its cap", () => {
        const driver = new StepDriver();
        driver.stepsDue(0);

        expect(driver.stepsDue(60 * 1000)).toBe(MAX_STEPS_PER_CALL);
        expect(driver.stepsDue(60 * 1000 + 1)).toBe(0);
    });

    describe("running", () => {

        it("takes the steps due while the city is stepping", () => {
            const driver = new StepDriver();
            const step = jest.fn();
            driver.run(0, () => true, step);

            driver.run(3 * STEP + 1, () => true, step);

            expect(step).toHaveBeenCalledTimes(3);
        });

        it("ends the run at the step that stops the city", () => {
            const driver = new StepDriver();
            let stepping = true;
            const step = jest.fn(() => {
                stepping = step.mock.calls.length < 2;
            });
            driver.run(0, () => stepping, step);

            driver.run(5 * STEP + 1, () => stepping, step);

            expect(step).toHaveBeenCalledTimes(2);
        });

        it("owes nothing for time the city was not stepping", () => {
            const driver = new StepDriver();
            const step = jest.fn();
            driver.run(0, () => true, step);
            driver.run(10 * STEP, () => false, step);

            driver.run(10 * STEP + 1, () => true, step);
            driver.run(11 * STEP + 2, () => true, step);

            expect(step).toHaveBeenCalledTimes(1);
        });
    });

    it("owes nothing for time spent idle", () => {
        const driver = new StepDriver();
        driver.stepsDue(0);
        driver.idle();

        expect(driver.stepsDue(10 * STEP)).toBe(0);
        expect(driver.stepsDue(11 * STEP + 1)).toBe(1);
    });
});
