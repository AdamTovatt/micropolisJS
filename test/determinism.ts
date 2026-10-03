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

import { SimulationInstance, YEAR, buildCity } from "./helpers/simulations";

const SEED = 2026;
const OTHER_SEED = 2027;

// Two cities stepped in turn, so each step of one runs between steps of the other in the same process
function stepBoth(first: SimulationInstance, second: SimulationInstance, steps: number) {
    for (let i = 0; i < steps; i++) {
        first.step();
        second.step();
    }
}

// The sprites in flight: their type, position and frame
function sprites(simulation: SimulationInstance) {
    return simulation.spriteManager.getSpriteList().map((sprite: {type: number, x: number, y: number, frame: number}) =>
        ({type: sprite.type, x: sprite.x, y: sprite.y, frame: sprite.frame}));
}

// A year of growth, then a monster and a tornado for a year: their moves draw from the stream, and their damage
// leaves fires and explosions for the scan to clear
function run(first: SimulationInstance, second: SimulationInstance) {
    stepBoth(first, second, YEAR);
    const grown = first._census.resPop;

    for (const simulation of [first, second]) {
        simulation.spriteManager.makeMonster();
        simulation.spriteManager.makeTornado();
    }
    const unleashed = sprites(first).length;

    stepBoth(first, second, YEAR);
    return {grown, unleashed};
}

function savedState(simulation: SimulationInstance) {
    const saveData: Record<string, unknown> = {};
    simulation.save(saveData);
    return saveData;
}

describe("two simulations stepped together", () => {

    it("end in the same state from the same seed after the same steps", () => {
        const first = buildCity(SEED, SEED);
        const second = buildCity(SEED, SEED);

        const {grown, unleashed} = run(first, second);

        // The comparison covers zones the simulation grew and sprites it moved, not just the map it started from
        expect(grown).toBeGreaterThan(0);
        expect(unleashed).toBe(2);
        expect(sprites(first).length).toBeGreaterThan(0);
        expect(savedState(second)).toEqual(savedState(first));
        expect(sprites(second)).toEqual(sprites(first));
    });

    it("end in different states from different simulation seeds on the same map", () => {
        const first = buildCity(SEED, SEED);
        const second = buildCity(SEED, OTHER_SEED);

        run(first, second);

        // The seeds and stream states differ by construction: the city itself has to differ too
        const withoutStream = (saveData: Record<string, unknown>) => {
            const rest = {...saveData};
            delete rest.seed;
            delete rest.randomState;
            return rest;
        };
        expect(withoutStream(savedState(second))).not.toEqual(withoutStream(savedState(first)));
    });
});
