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

import { BuildingTool } from "../src/buildingTool.js";
import { MapGenerator } from "../src/mapGenerator.js";
import { Random } from "../src/random";
import { RoadTool } from "../src/roadTool.js";
import { Simulation } from "../src/simulation.js";
import { COMCLR, DIRT, FREEZ, INDCLR, POWERPLANT } from "../src/tileValues";

const SEED = 2026;
const OTHER_SEED = 2027;

// A city year at fast speed, where every step runs a phase: 16 phases advance the city time by 1, and 48 make a year
const YEAR = 16 * 48;

type SimulationInstance = InstanceType<typeof Simulation>;

interface Tool {
    result: number;
    doTool(x: number, y: number, blockMaps: unknown, random: Random): void;
    modifyIfEnoughFunding(budget: unknown): boolean;
}

function use(simulation: SimulationInstance, tool: Tool, x: number, y: number) {
    tool.doTool(x, y, simulation.blockMaps, simulation.random);
    if (!tool.modifyIfEnoughFunding(simulation.budget)) {
        throw new Error(`The tool failed at (${x}, ${y}) with result ${tool.result}`);
    }
}

// A city on the map of mapSeed, simulated from simulationSeed: a coal plant powering a row of zones along a road,
// built on ground cleared to dirt so the same tools build it on any map
function buildCity(mapSeed: number, simulationSeed: number) {
    const map = MapGenerator(Random.mapStream(mapSeed));
    for (let y = 38; y <= 50; y++) {
        for (let x = 38; x <= 72; x++) {
            map.setTile(x, y, DIRT, 0);
        }
    }

    const simulation = new Simulation(map, Simulation.LEVEL_EASY, Simulation.SPEED_FAST, simulationSeed, null);

    // A building tool's coordinates are its footprint's second column and row: the centre of a 3x3 zone
    use(simulation, new BuildingTool(3000, POWERPLANT, map, 4, false), 41, 42);
    for (const x of [45, 48, 51, 54]) {
        use(simulation, new BuildingTool(100, FREEZ, map, 3, false), x, 43);
    }
    for (const x of [57, 60]) {
        use(simulation, new BuildingTool(100, COMCLR, map, 3, false), x, 43);
    }
    for (const x of [63, 66]) {
        use(simulation, new BuildingTool(100, INDCLR, map, 3, false), x, 43);
    }
    const road = new RoadTool(map);
    for (let x = 40; x <= 68; x++) {
        use(simulation, road, x, 45);
    }

    return simulation;
}

// Two cities stepped in turn, so each step of one runs between steps of the other in the same process
function stepBoth(first: SimulationInstance, second: SimulationInstance, steps: number) {
    for (let i = 0; i < steps; i++) {
        first.step();
        second.step();
    }
}

// The state a save leaves out: the sprites in flight
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
