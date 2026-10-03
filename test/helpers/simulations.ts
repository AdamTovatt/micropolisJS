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

import { BuildingTool } from "../../src/buildingTool.js";
import { GameMap } from "../../src/gameMap.js";
import { MapGenerator } from "../../src/mapGenerator.js";
import { Random } from "../../src/random";
import { RoadTool } from "../../src/roadTool.js";
import { Simulation } from "../../src/simulation.js";
import { COMCLR, DIRT, FREEZ, INDCLR, POWERPLANT } from "../../src/tileValues";

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

    // A building tool's coordinates are its footprint's second column and row: the centre of a 3x3 zone
    useTool(simulation,new BuildingTool(3000, POWERPLANT, map, 4, false), 41, 42);
    for (const x of [45, 48, 51, 54]) {
        useTool(simulation,new BuildingTool(100, FREEZ, map, 3, false), x, 43);
    }
    for (const x of [57, 60]) {
        useTool(simulation,new BuildingTool(100, COMCLR, map, 3, false), x, 43);
    }
    for (const x of [63, 66]) {
        useTool(simulation,new BuildingTool(100, INDCLR, map, 3, false), x, 43);
    }
    const road = new RoadTool(map);
    for (let x = 40; x <= 68; x++) {
        useTool(simulation,road, x, 45);
    }

    return simulation;
}
