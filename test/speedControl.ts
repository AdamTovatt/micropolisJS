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

import type { CityStart } from "../src/citySource";
import { LOCAL_PLAYER } from "../src/protocol";
import { SaveFormat } from "../src/savedGame";
import { Simulation } from "../src/simulation.js";
import { SpeedControl } from "../src/speedControl";
import { plainSavedState } from "../src/stateHash";
import { hostedCity } from "./helpers/hostedCity";
import { simulationFromSeed } from "./helpers/simulations";

const SEED = 2026;

// A speed control over a hosted city, as the game builds one: it sends its commands through the host, and follows the
// settings records the client's copy of the city receives. shown is every paused state the pause button has been
// shown, in order. apply applies the commands sent since the last call, and publishes what they changed.
function control(start: CityStart) {
    const {host, state} = hostedCity();
    host.start(start);

    const shown: boolean[] = [];
    const sent: number[] = [];
    const speedControl = new SpeedControl(state.current("settings").speed, (speed) => {
        sent.push(speed);
        host.send(LOCAL_PLAYER, {type: "setSpeed", speed});
    }, (paused) => shown.push(paused));
    state.on("settings", (settings) => speedControl.showSpeed(settings.speed));

    const speed = () => state.current("settings").speed;
    return {speedControl, shown, sent, host, speed, apply: () => host.flush()};
}

function newGame() {
    return control({name: "Town", seed: SEED, level: Simulation.LEVEL_EASY});
}

// A game saved at the given speed, loaded as the browser loads it
function loadedAt(speed: number) {
    const original = simulationFromSeed(SEED, speed);
    return control({save: SaveFormat.serialise({...plainSavedState(original), name: "Town"})});
}

describe("the speed control", () => {

    it("pauses a new game and resumes it at medium", () => {
        const {speedControl, shown, speed, apply} = newGame();

        speedControl.togglePause();
        apply();
        const paused = speed();
        speedControl.togglePause();
        apply();

        expect([paused, speed()]).toEqual([Simulation.SPEED_PAUSED, Simulation.SPEED_MED]);
        expect(shown).toEqual([false, true, false]);
    });

    // The button shows the city's speed, so a pause shows once the simulation has applied it
    it("shows the speed the simulation has, not the one the player asked for", () => {
        const {speedControl, shown, speed} = newGame();

        speedControl.togglePause();

        expect(speed()).toBe(Simulation.SPEED_MED);
        expect(shown).toEqual([false]);
    });

    it("shows a game saved paused as paused, and resumes it at medium with one Play", () => {
        const {speedControl, shown, speed, apply} = loadedAt(Simulation.SPEED_PAUSED);

        speedControl.togglePause();
        apply();

        expect(speed()).toBe(Simulation.SPEED_MED);
        expect(shown).toEqual([true, false]);
    });

    it("resumes a game saved running at the speed it was saved at", () => {
        const {speedControl, speed, apply} = loadedAt(Simulation.SPEED_SLOW);

        speedControl.togglePause();
        apply();
        speedControl.togglePause();
        apply();

        expect(speed()).toBe(Simulation.SPEED_SLOW);
    });

    it("runs at the speed Settings chooses", () => {
        const {speedControl, shown, speed, apply} = newGame();

        speedControl.setRunningSpeed(Simulation.SPEED_FAST);
        apply();

        expect(speed()).toBe(Simulation.SPEED_FAST);
        expect(speedControl.getRunningSpeed()).toBe(Simulation.SPEED_FAST);
        expect(shown).toEqual([false, false]);
    });

    // The settings window sends its speed whenever it closes, changed or not
    it("sends nothing when Settings closes at the speed the city already runs at", () => {
        const {speedControl, sent} = newGame();

        speedControl.setRunningSpeed(Simulation.SPEED_MED);

        expect(sent).toEqual([]);
    });

    it("keeps a paused game paused when Settings chooses a speed, and resumes it at that speed", () => {
        const {speedControl, shown, speed, apply} = newGame();
        speedControl.togglePause();
        apply();

        speedControl.setRunningSpeed(Simulation.SPEED_FAST);
        apply();
        const whilePaused = speed();
        speedControl.togglePause();
        apply();

        expect([whilePaused, speed()]).toEqual([Simulation.SPEED_PAUSED, Simulation.SPEED_FAST]);
        expect(shown).toEqual([false, true, false]);
    });

    // As a replayed log or another player may: Play then resumes at the speed the city last ran at
    it("follows a speed set by another player's command", () => {
        const {speedControl, shown, host, speed, apply} = newGame();

        host.send("another player", {type: "setSpeed", speed: Simulation.SPEED_SLOW});
        apply();
        host.send("another player", {type: "setSpeed", speed: Simulation.SPEED_PAUSED});
        apply();
        speedControl.togglePause();
        apply();

        expect(speed()).toBe(Simulation.SPEED_SLOW);
        expect(shown).toEqual([false, false, true, false]);
    });

    // A settings record carries auto-budget and disasters beside the speed
    it("shows nothing new when a setting other than the speed changes", () => {
        const {shown, host, apply} = newGame();

        host.send(LOCAL_PLAYER, {type: "setAutoBudget", on: false});
        apply();

        expect(shown).toEqual([false]);
    });
});
