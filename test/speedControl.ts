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

import { Simulation } from "../src/simulation.js";
import { SpeedControl } from "../src/speedControl";
import { plainSavedState } from "../src/stateHash";
import { SimulationInstance, simulationFromSeed } from "./helpers/simulations";

const SEED = 2026;

// A speed control over the simulation, and every paused state the pause button has been shown, in order
function control(simulation: SimulationInstance) {
    const shown: boolean[] = [];
    const speedControl = new SpeedControl(simulation, (paused) => shown.push(paused));
    return {speedControl, shown};
}

// A game saved at the given speed, loaded as the browser loads it
function loadedAt(speed: number) {
    const original = simulationFromSeed(SEED, speed);
    return Simulation.fromSave(plainSavedState(original));
}

describe("the speed control", () => {

    it("pauses a new game and resumes it at medium", () => {
        const simulation = simulationFromSeed(SEED);
        const {speedControl, shown} = control(simulation);

        speedControl.togglePause();
        const paused = simulation.getSpeed();
        speedControl.togglePause();

        expect([paused, simulation.getSpeed()]).toEqual([Simulation.SPEED_PAUSED, Simulation.SPEED_MED]);
        expect(shown).toEqual([false, true, false]);
    });

    it("shows a game saved paused as paused, and resumes it at medium with one Play", () => {
        const simulation = loadedAt(Simulation.SPEED_PAUSED);
        const {speedControl, shown} = control(simulation);

        speedControl.togglePause();

        expect(simulation.getSpeed()).toBe(Simulation.SPEED_MED);
        expect(shown).toEqual([true, false]);
    });

    it("resumes a game saved running at the speed it was saved at", () => {
        const simulation = loadedAt(Simulation.SPEED_SLOW);
        const {speedControl} = control(simulation);

        speedControl.togglePause();
        speedControl.togglePause();

        expect(simulation.getSpeed()).toBe(Simulation.SPEED_SLOW);
    });

    it("runs at the speed Settings chooses", () => {
        const simulation = simulationFromSeed(SEED);
        const {speedControl, shown} = control(simulation);

        speedControl.setRunningSpeed(Simulation.SPEED_FAST);

        expect(simulation.getSpeed()).toBe(Simulation.SPEED_FAST);
        expect(speedControl.getRunningSpeed()).toBe(Simulation.SPEED_FAST);
        expect(shown).toEqual([false, false]);
    });

    it("keeps a paused game paused when Settings chooses a speed, and resumes it at that speed", () => {
        const simulation = simulationFromSeed(SEED);
        const {speedControl, shown} = control(simulation);
        speedControl.togglePause();

        speedControl.setRunningSpeed(Simulation.SPEED_FAST);
        const whilePaused = simulation.getSpeed();
        speedControl.togglePause();

        expect([whilePaused, simulation.getSpeed()]).toEqual([Simulation.SPEED_PAUSED, Simulation.SPEED_FAST]);
        expect(shown).toEqual([false, true, false]);
    });
});
