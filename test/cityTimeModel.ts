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

import { clockOf, impliedCityTime, stepsPerCityTime } from "../src/cityTimeModel";
import { Simulation } from "../src/simulation.js";
import { simulationFromSeed } from "./helpers/simulations";

describe("the city time model", () => {

    it.each([[Simulation.SPEED_SLOW, 80], [Simulation.SPEED_MED, 48], [Simulation.SPEED_FAST, 16]])(
        "takes a unit of city time in so many steps at speed %i", (speed, steps) => {
            expect(stepsPerCityTime(speed)).toBe(steps);
            expect(impliedCityTime({speed, speedCycle: 0, phase: 1, cityTime: 0}, steps)).toBe(1);
            expect(impliedCityTime({speed, speedCycle: 0, phase: 1, cityTime: 0}, steps - 1)).toBe(0);
        });

    // At medium, 1023 and then 0 both let a phase through: two phases on consecutive steps
    it("lets a phase through on both sides of the speed cycle's wrap", () => {
        expect(impliedCityTime({speed: Simulation.SPEED_MED, speedCycle: 1022, phase: 15, cityTime: 5}, 2)).toBe(6);
    });

    it("has no city time at a paused speed", () => {
        expect(() => stepsPerCityTime(Simulation.SPEED_PAUSED)).toThrow("City time doesn't advance at speed 0");
    });

    describe.each([Simulation.SPEED_SLOW, Simulation.SPEED_MED, Simulation.SPEED_FAST])(
        "against the simulation at speed %i", (speed) => {

            it.each([["a new city", 0], ["mid-cycle", 37], ["the speed cycle's wrap", 1022 - 500]])(
                "agrees from %s", (_name, startCycle) => {
                    const simulation = simulationFromSeed(1, speed);
                    simulation._speedCycle = startCycle;
                    for (let i = 0; i < 500; i++) {
                        simulation.step();
                    }
                    const start = clockOf(simulation);

                    for (let i = 0; i < 1000; i++) {
                        simulation.step();
                    }

                    expect(impliedCityTime(start, 1000)).toBe(simulation._cityTime);
                });
        });
});
