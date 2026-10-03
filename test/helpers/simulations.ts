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

import { GameMap } from "../../src/gameMap.js";
import { MapGenerator } from "../../src/mapGenerator.js";
import { Random } from "../../src/random";
import { Simulation } from "../../src/simulation.js";

// Building simulations, and editing their cities, as the tests do

export type SimulationInstance = InstanceType<typeof Simulation>;

// A new easy-level simulation of the given map, from the given seed
export function newSimulation(map: InstanceType<typeof GameMap>, seed: number,
                              speed = Simulation.SPEED_MED): SimulationInstance {
    return new Simulation(map, Simulation.LEVEL_EASY, speed, seed, null);
}

// A new simulation of the map the seed generates, as a new game starts
export function simulationFromSeed(seed: number, speed = Simulation.SPEED_MED): SimulationInstance {
    return newSimulation(MapGenerator(Random.mapStream(seed)), seed, speed);
}

interface Tool {
    result: number;
    doTool(x: number, y: number, blockMaps: unknown, random: Random): void;
    modifyIfEnoughFunding(budget: unknown): boolean;
}

// Applies a tool at (x, y) as the game does, drawing from the simulation's stream and charging its budget
export function useTool(simulation: SimulationInstance, tool: Tool, x: number, y: number): void {
    tool.doTool(x, y, simulation.blockMaps, simulation.random);
    if (!tool.modifyIfEnoughFunding(simulation.budget)) {
        throw new Error(`The tool failed at (${x}, ${y}) with result ${tool.result}`);
    }
}
