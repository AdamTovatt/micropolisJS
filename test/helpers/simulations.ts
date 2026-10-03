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

import { cityFromSeed, Level, Simulation as HeadlessSimulation } from "../../headless/city";
import { CityBuilder } from "../../headless/fixtures/builder";
import { GameMap } from "../../src/gameMap.js";
import { MapGenerator } from "../../src/mapGenerator.js";
import { Random } from "../../src/random";
import { Simulation } from "../../src/simulation.js";
import { DIRT } from "../../src/tileValues";

// Building simulations, and editing their cities, as the tests do

export type SimulationInstance = InstanceType<typeof Simulation>;

// A new easy-level simulation of the given map, from the given seed
export function newSimulation(map: InstanceType<typeof GameMap>, seed: number,
                              speed = Simulation.SPEED_MED): SimulationInstance {
    return new Simulation(map, Simulation.LEVEL_EASY, speed, seed);
}

// A new easy-level simulation of the map the seed generates, as a new game starts, with the simulation's internals
// open to the tests
export function simulationFromSeed(seed: number, speed = Simulation.SPEED_MED): SimulationInstance {
    return cityFromSeed(seed, Level.easy, speed) as unknown as SimulationInstance;
}

// A city year at fast speed, where every step runs a phase: 16 phases advance the city time by 1, and 48 make a year
export const YEAR = 16 * 48;

// A city on the map of mapSeed, simulated from simulationSeed at fast speed: a coal plant powering a row of zones along
// a road, built on ground cleared to dirt so the same tools build it on any map. It has residents within a year.
export function buildCity(mapSeed: number, simulationSeed: number): SimulationInstance {
    const map = MapGenerator(Random.mapStream(mapSeed));
    for (let y = 38; y <= 50; y++) {
        for (let x = 38; x <= 72; x++) {
            map.setTile(x, y, DIRT, 0);
        }
    }

    const simulation = newSimulation(map, simulationSeed, Simulation.SPEED_FAST);

    // The player's tools and costs, each building placed by its centre tile
    const builder = new CityBuilder(simulation as unknown as HeadlessSimulation);
    builder.coal(41, 42);
    for (const x of [45, 48, 51, 54]) {
        builder.residential(x, 43);
    }
    for (const x of [57, 60]) {
        builder.commercial(x, 43);
    }
    for (const x of [63, 66]) {
        builder.industrial(x, 43);
    }
    builder.road(40, 45, 68, 45);

    return simulation;
}
