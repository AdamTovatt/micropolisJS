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

import { CommandQueue } from "../src/commandQueue";
import { CommandResult, LOCAL_PLAYER, ReceivedCommand } from "../src/commands";
import { Simulation } from "../src/simulation.js";
import { SpeedControl } from "../src/speedControl";
import { plainSavedState } from "../src/stateHash";
import { SimulationInstance, simulationFromSeed } from "./helpers/simulations";

const SEED = 2026;

// A speed control over the simulation, sending its commands through a queue as the game does, and every paused state
// the pause button has been shown, in order. apply applies the commands sent since the last call.
function control(simulation: SimulationInstance) {
    const queue = new CommandQueue({
        applyCommands: (received: ReceivedCommand[]) => simulation.applyCommands(received) as CommandResult[],
        step: () => simulation.step(),
    }, () => {});
    const shown: boolean[] = [];
    const sent: number[] = [];
    const speedControl = new SpeedControl(simulation, (speed) => {
        sent.push(speed);
        queue.send(LOCAL_PLAYER, {type: "setSpeed", speed});
    }, (paused) => shown.push(paused));
    return {speedControl, shown, sent, queue, apply: () => queue.applyCommands()};
}

// A game saved at the given speed, loaded as the browser loads it
function loadedAt(speed: number) {
    const original = simulationFromSeed(SEED, speed);
    return Simulation.fromSave(plainSavedState(original));
}

describe("the speed control", () => {

    it("pauses a new game and resumes it at medium", () => {
        const simulation = simulationFromSeed(SEED);
        const {speedControl, shown, apply} = control(simulation);

        speedControl.togglePause();
        apply();
        const paused = simulation.getSpeed();
        speedControl.togglePause();
        apply();

        expect([paused, simulation.getSpeed()]).toEqual([Simulation.SPEED_PAUSED, Simulation.SPEED_MED]);
        expect(shown).toEqual([false, true, false]);
    });

    // The button shows the city's speed, so a pause shows once the simulation has applied it
    it("shows the speed the simulation has, not the one the player asked for", () => {
        const simulation = simulationFromSeed(SEED);
        const {speedControl, shown} = control(simulation);

        speedControl.togglePause();

        expect(simulation.isPaused()).toBe(false);
        expect(shown).toEqual([false]);
    });

    it("shows a game saved paused as paused, and resumes it at medium with one Play", () => {
        const simulation = loadedAt(Simulation.SPEED_PAUSED);
        const {speedControl, shown, apply} = control(simulation);

        speedControl.togglePause();
        apply();

        expect(simulation.getSpeed()).toBe(Simulation.SPEED_MED);
        expect(shown).toEqual([true, false]);
    });

    it("resumes a game saved running at the speed it was saved at", () => {
        const simulation = loadedAt(Simulation.SPEED_SLOW);
        const {speedControl, apply} = control(simulation);

        speedControl.togglePause();
        apply();
        speedControl.togglePause();
        apply();

        expect(simulation.getSpeed()).toBe(Simulation.SPEED_SLOW);
    });

    it("runs at the speed Settings chooses", () => {
        const simulation = simulationFromSeed(SEED);
        const {speedControl, shown, apply} = control(simulation);

        speedControl.setRunningSpeed(Simulation.SPEED_FAST);
        apply();

        expect(simulation.getSpeed()).toBe(Simulation.SPEED_FAST);
        expect(speedControl.getRunningSpeed()).toBe(Simulation.SPEED_FAST);
        expect(shown).toEqual([false, false]);
    });

    // The settings window sends its speed whenever it closes, changed or not
    it("sends nothing when Settings closes at the speed the city already runs at", () => {
        const simulation = simulationFromSeed(SEED);
        const {speedControl, sent} = control(simulation);

        speedControl.setRunningSpeed(Simulation.SPEED_MED);

        expect(sent).toEqual([]);
    });

    it("keeps a paused game paused when Settings chooses a speed, and resumes it at that speed", () => {
        const simulation = simulationFromSeed(SEED);
        const {speedControl, shown, apply} = control(simulation);
        speedControl.togglePause();
        apply();

        speedControl.setRunningSpeed(Simulation.SPEED_FAST);
        apply();
        const whilePaused = simulation.getSpeed();
        speedControl.togglePause();
        apply();

        expect([whilePaused, simulation.getSpeed()]).toEqual([Simulation.SPEED_PAUSED, Simulation.SPEED_FAST]);
        expect(shown).toEqual([false, true, false]);
    });

    // As a replayed log or another player may: Play then resumes at the speed the city last ran at
    it("follows a speed set by another player's command", () => {
        const simulation = simulationFromSeed(SEED);
        const {speedControl, shown, queue, apply} = control(simulation);

        queue.send("another player", {type: "setSpeed", speed: Simulation.SPEED_SLOW});
        apply();
        queue.send("another player", {type: "setSpeed", speed: Simulation.SPEED_PAUSED});
        apply();
        speedControl.togglePause();
        apply();

        expect(simulation.getSpeed()).toBe(Simulation.SPEED_SLOW);
        expect(shown).toEqual([false, false, true, false]);
    });
});
