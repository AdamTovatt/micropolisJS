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

import { BlockMap } from "../src/blockMap";
import { Direction, forEachCardinalDirection } from "../src/direction";
import { GameMap } from "../src/gameMap.js";
import { NOT_ENOUGH_POWER } from "../src/messages";
import { Position } from "../src/position";
import { PowerManager } from "../src/powerManager.js";
import { ANIMBIT, BURNBIT, CONDBIT, POWERBIT } from "../src/tileFlags";
import { COALSMOKE1, COALSMOKE2, COALSMOKE3, COALSMOKE4, NUCLEAR } from "../src/tileValues";

const WIDTH = 120;
const HEIGHT = 100;
const COAL_POWER_STRENGTH = 700;
const NUCLEAR_POWER_STRENGTH = 2000;

type GameMapInstance = InstanceType<typeof GameMap>;
type PowerManagerInstance = InstanceType<typeof PowerManager>;

interface Plant {
    x: number;
    y: number;
    nuclear: boolean;
}

interface Fixture {
    name: string;
    conductive: (x: number, y: number) => boolean;
    plants: Plant[];
}

interface OriginalResult {
    grid: BlockMap;
    consumption: number;
    notEnoughPower: boolean;
}

// The original's power scan, which stops the walk at the first step past maxPower (doPowerScan in the C++
// engine's power.cpp), as this port transcribed it, with `this` made explicit. It is the oracle the scan's
// powered tiles are pinned against.
function originalPowerScan(map: GameMapInstance, stack: Position[], coalPowerPop: number,
                           nuclearPowerPop: number): OriginalResult {
    const powerGridMap = new BlockMap(map.width, map.height, 1);

    const testForConductive = (pos: Position, testDir: Direction) => {
        const movedPos = Position.move(pos, testDir);

        if (map.isPositionInBounds(movedPos)) {
            if (map.getTile(movedPos.x, movedPos.y).isConductive()) {
                if (powerGridMap.worldGet(movedPos.x, movedPos.y) === 0) {
                    return true;
                }
            }
        }

        return false;
    };

    const maxPower = coalPowerPop * COAL_POWER_STRENGTH + nuclearPowerPop * NUCLEAR_POWER_STRENGTH;
    let powerConsumption = 0;

    while (stack.length > 0) {
        let pos = stack.pop() as Position;
        let anyDir: Direction | undefined;
        let conNum: number;
        do {
            powerConsumption++;
            if (powerConsumption > maxPower) {
                return {grid: powerGridMap, consumption: powerConsumption, notEnoughPower: true};
            }

            if (anyDir) {
                pos = Position.move(pos, anyDir);
            }

            powerGridMap.worldSet(pos.x, pos.y, 1);
            conNum = 0;

            forEachCardinalDirection((dir) => {
                if (conNum >= 2) {
                    return;
                }

                if (testForConductive(pos, dir)) {
                    conNum++;
                    anyDir = dir;
                }
            });

            if (conNum > 1) {
                stack.push(new Position(pos.x, pos.y));
            }
        } while (conNum);
    }

    return {grid: powerGridMap, consumption: powerConsumption, notEnoughPower: false};
}

function buildMap(fixture: Fixture) {
    const map = new GameMap(WIDTH, HEIGHT);

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (fixture.conductive(x, y)) {
                map.getTile(x, y).addFlags(CONDBIT);
            }
        }
    }

    for (const plant of fixture.plants) {
        map.getTile(plant.x, plant.y).addFlags(CONDBIT);
    }

    return map;
}

function plantStack(fixture: Fixture): Position[] {
    return fixture.plants.map((plant) => new Position(plant.x, plant.y));
}

function coalCount(fixture: Fixture) {
    return fixture.plants.filter((plant) => !plant.nuclear).length;
}

function nuclearCount(fixture: Fixture) {
    return fixture.plants.filter((plant) => plant.nuclear).length;
}

// What the map scan does with the plants: the census and the stack are cleared, then each plant is found, which
// pushes it, counts it in the census, and for a coal plant sets its smoke tiles. Returns the census.
function findPlants(manager: PowerManagerInstance, map: GameMapInstance, fixture: Fixture) {
    const simData = {census: {coalPowerPop: 0, nuclearPowerPop: 0},
                     disasterManager: {disastersEnabled: false}, gameLevel: 0};

    manager.clearPowerStack();
    for (const plant of fixture.plants) {
        if (plant.nuclear) {
            manager.nuclearPowerFound(map, plant.x, plant.y, simData);
        } else {
            manager.coalPowerFound(map, plant.x, plant.y, simData);
        }
    }

    return simData.census;
}

// Scans the way the simulation does each cycle: the map scan finds the plants, then the power scan runs.
function findPlantsAndScan(manager: PowerManagerInstance, map: GameMapInstance, fixture: Fixture) {
    manager.doPowerScan(findPlants(manager, map, fixture));
}

// The map as the map scan leaves it for the power scan, which is the map the original's power scan walks too
function foundPlantsMap(fixture: Fixture) {
    const map = buildMap(fixture);
    findPlants(new PowerManager(map), map, fixture);
    return map;
}

function scan(fixture: Fixture) {
    const map = buildMap(fixture);
    const manager = new PowerManager(map);
    const emitted: string[] = [];
    manager.addEventListener(NOT_ENOUGH_POWER, () => emitted.push(NOT_ENOUGH_POWER));

    findPlantsAndScan(manager, map, fixture);

    return {manager, map, notEnoughPowerCount: emitted.length};
}

// Results of the original's scan and the port's, computed in beforeAll so a fixture that throws fails its own
// tests rather than the collection of the whole file.
function scanResults(fixture: Fixture) {
    const results = {} as {
        original: OriginalResult,
        uncapped: OriginalResult,
        port: ReturnType<typeof scan>,
    };

    beforeAll(() => {
        results.original = originalPowerScan(foundPlantsMap(fixture), plantStack(fixture), coalCount(fixture),
                                             nuclearCount(fixture));
        results.uncapped = originalPowerScan(foundPlantsMap(fixture), plantStack(fixture), 1000000, 0);
        results.port = scan(fixture);
    });

    return results;
}

function poweredTiles(grid: BlockMap): string[] {
    const tiles = [];

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (grid.worldGet(x, y) > 0) {
                tiles.push(`${x},${y}`);
            }
        }
    }

    return tiles;
}

// A small deterministic generator, so the random fixtures are the same on every run. It is the test's own,
// so the fixtures do not draw on the simulation's random stream.
function lcg(seed: number) {
    let state = seed;

    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
}

function randomFixture(seed: number, density: number, coal: number, nuclear: number): Fixture {
    const next = lcg(seed);
    const cells: boolean[] = [];

    for (let i = 0; i < WIDTH * HEIGHT; i++) {
        cells[i] = next() < density;
    }

    const plants: Plant[] = [];
    for (let i = 0; i < coal + nuclear; i++) {
        plants.push({
            nuclear: i >= coal,
            x: 2 + Math.floor(next() * (WIDTH - 4)),
            y: 2 + Math.floor(next() * (HEIGHT - 4)),
        });
    }

    return {
        conductive: (x, y) => cells[y * WIDTH + x],
        name: `random seed ${seed}, density ${density}, ${coal} coal, ${nuclear} nuclear`,
        plants,
    };
}

// A lattice of wires every third row and column: a branch point at every crossing, so the walk pushes and
// pops the stack constantly.
const lattice: Fixture = {
    conductive: (x, y) => x % 3 === 0 || y % 3 === 0,
    name: "wire lattice over the whole map, one coal plant",
    plants: [{x: 60, y: 51, nuclear: false}],
};

const overCapacityFixtures: Fixture[] = [
    lattice,
    randomFixture(1, 0.68, 1, 0),
    randomFixture(2, 0.65, 2, 1),
    randomFixture(3, 0.7, 3, 0),
    randomFixture(4, 0.75, 1, 2),
    randomFixture(5, 0.62, 4, 1),
];

const underCapacityFixtures: Fixture[] = [
    randomFixture(6, 0.55, 2, 0),
    randomFixture(7, 0.5, 1, 1),
];

// A single unbranched wire of the given number of tiles, starting at a nuclear plant: it runs along every other
// row, joined at alternate ends. The walk takes one step per tile, so its load is its length. A coal plant would
// branch it: finding one makes its smoke tiles conductive.
function wire(length: number): Fixture {
    const path: string[] = [];

    for (let row = 1; path.length < length; row += 2) {
        const xs = [];
        for (let x = 1; x < WIDTH - 1; x++) {
            xs.push(x);
        }
        if (row % 4 === 3) {
            xs.reverse();
        }

        xs.forEach((x) => path.push(`${x},${row}`));
        path.push(`${xs[xs.length - 1]},${row + 1}`);
    }

    const tiles = new Set(path.slice(0, length));

    return {
        conductive: (cx, cy) => tiles.has(`${cx},${cy}`),
        name: `a wire of ${length} tiles from one nuclear plant`,
        plants: [{x: 1, y: 1, nuclear: true}],
    };
}

describe("the power scan of an over-capacity city", () => {

    describe.each(overCapacityFixtures.map((fixture) => [fixture.name, fixture]))("%s", (_, fixture) => {
        const results = scanResults(fixture);

        it("is over capacity, with conductive tiles left unpowered", () => {
            expect(results.original.notEnoughPower).toBe(true);
            expect(poweredTiles(results.original.grid).length)
                .toBeLessThan(poweredTiles(results.uncapped.grid).length);
        });

        it("powers exactly the tiles the original's scan powers", () => {
            expect(poweredTiles(results.port.manager.powerGridMap)).toEqual(poweredTiles(results.original.grid));
        });

        it("reports the capacity of its plants", () => {
            expect(results.port.manager.powerCapacity).toBe(coalCount(fixture) * COAL_POWER_STRENGTH +
                                                            nuclearCount(fixture) * NUCLEAR_POWER_STRENGTH);
        });

        it("measures the load an uncapped scan counts", () => {
            expect(results.port.manager.powerLoad).toBe(results.uncapped.consumption);
            expect(results.port.manager.powerLoad).toBeGreaterThan(results.port.manager.powerCapacity);
        });

        it("reports NOT_ENOUGH_POWER once", () => {
            expect(results.port.notEnoughPowerCount).toBe(1);
        });
    });
});

describe("the power scan of a city within capacity", () => {

    describe.each(underCapacityFixtures.map((fixture) => [fixture.name, fixture]))("%s", (_, fixture) => {
        const results = scanResults(fixture);

        it("is within capacity", () => {
            expect(results.original.notEnoughPower).toBe(false);
            expect(poweredTiles(results.original.grid).length).toBeGreaterThan(1);
        });

        it("powers exactly the tiles the original's scan powers", () => {
            expect(poweredTiles(results.port.manager.powerGridMap)).toEqual(poweredTiles(results.original.grid));
        });

        it("measures the load the scan counted", () => {
            expect(results.port.manager.powerLoad).toBe(results.original.consumption);
            expect(results.port.manager.powerLoad).toBeLessThanOrEqual(results.port.manager.powerCapacity);
        });

        it("does not report NOT_ENOUGH_POWER", () => {
            expect(results.port.notEnoughPowerCount).toBe(0);
        });
    });
});

describe("the power scan at exactly its capacity", () => {

    const fixtures: Array<[string, Fixture, boolean]> = [
        [wire(NUCLEAR_POWER_STRENGTH).name, wire(NUCLEAR_POWER_STRENGTH), false],
        [wire(NUCLEAR_POWER_STRENGTH + 1).name, wire(NUCLEAR_POWER_STRENGTH + 1), true],
    ];

    describe.each(fixtures)("%s", (_, fixture, overloaded) => {
        const results = scanResults(fixture);
        const powered = NUCLEAR_POWER_STRENGTH;

        it("measures one step per tile", () => {
            expect(results.port.manager.powerLoad).toBe(poweredTiles(results.uncapped.grid).length);
        });

        it(`${overloaded ? "reports" : "does not report"} NOT_ENOUGH_POWER`, () => {
            expect(results.port.notEnoughPowerCount).toBe(overloaded ? 1 : 0);
            expect(results.original.notEnoughPower).toBe(overloaded);
        });

        it(`powers ${powered} tiles, as the original's scan does`, () => {
            expect(poweredTiles(results.port.manager.powerGridMap).length).toBe(powered);
            expect(poweredTiles(results.port.manager.powerGridMap)).toEqual(poweredTiles(results.original.grid));
        });
    });
});

describe("a second power scan by the same manager", () => {

    it.each([lattice, randomFixture(6, 0.55, 2, 0)].map((fixture) => [fixture.name, fixture] as const))(
        "powers the same tiles again: %s", (_, fixture) => {
        const {manager, map} = scan(fixture);
        const first = poweredTiles(manager.powerGridMap);
        const firstLoad = manager.powerLoad;

        findPlantsAndScan(manager, map, fixture);

        expect(first.length).toBeGreaterThan(1);
        expect(poweredTiles(manager.powerGridMap)).toEqual(first);
        expect(manager.powerLoad).toBe(firstLoad);
    });
});

describe("the power manager", () => {

    describe("when scanning a coal power plant", () => {

        const CENTRE_X = 50;
        const CENTRE_Y = 50;

        function scanPlant() {
            const map = new GameMap(120, 100);
            const powerManager = new PowerManager(map);
            powerManager.coalPowerFound(map, CENTRE_X, CENTRE_Y, {census: {coalPowerPop: 0}});
            return map;
        }

        it("should animate the four smokestack tiles", () => {
            const map = scanPlant();

            for (const [dx, dy] of [[1, -1], [2, -1], [1, 0], [2, 0]]) {
                expect(map.getTileFlags(CENTRE_X + dx, CENTRE_Y + dy) & ANIMBIT).toBe(ANIMBIT);
            }
        });

        it("should set the four smokestack tiles to coal smoke, as coalSmoke does", () => {
            const map = scanPlant();
            const smoke = [[1, -1, COALSMOKE1], [2, -1, COALSMOKE2], [1, 0, COALSMOKE3], [2, 0, COALSMOKE4]];

            for (const [dx, dy, value] of smoke) {
                expect(map.getTileValue(CENTRE_X + dx, CENTRE_Y + dy)).toBe(value);
                expect(map.getTileFlags(CENTRE_X + dx, CENTRE_Y + dy)).toBe(ANIMBIT | CONDBIT | POWERBIT | BURNBIT);
            }
        });

        it("should not animate the plant's top-left corner", () => {
            const map = scanPlant();

            expect(map.getTileFlags(CENTRE_X - 1, CENTRE_Y - 1) & ANIMBIT).toBe(0);
        });
    });

    // As doSpecialZone in the original's simulate.cpp handles NUCLEAR: with disasters off, it counts the plant and
    // pushes it as a power source, and changes none of its tiles
    describe("when scanning a nuclear power plant", () => {

        const CENTRE_X = 50;
        const CENTRE_Y = 50;

        // The plant's 4 by 4 tiles, from the centre's upper left neighbour, value and flags
        function plantTiles(map: GameMapInstance): number[] {
            return Array.from({length: 16}, (_, i) =>
                map.getTile(CENTRE_X - 1 + (i % 4), CENTRE_Y - 1 + Math.floor(i / 4)).getRawValue());
        }

        function scanPlant() {
            const map = new GameMap(WIDTH, HEIGHT);
            map.putZone(CENTRE_X, CENTRE_Y, NUCLEAR, 4);
            const tilesBefore = plantTiles(map);
            const powerManager = new PowerManager(map);
            const census = {nuclearPowerPop: 0};

            powerManager.nuclearPowerFound(map, CENTRE_X, CENTRE_Y,
                                           {census, disasterManager: {disastersEnabled: false}});

            const scanData: {powerStack?: unknown} = {};
            powerManager.saveScan(scanData);
            return {census, powerStack: scanData.powerStack, tilesBefore, tilesAfter: plantTiles(map)};
        }

        it("should count the plant", () => {
            expect(scanPlant().census.nuclearPowerPop).toBe(1);
        });

        it("should push the plant as a power source", () => {
            expect(scanPlant().powerStack).toEqual([{x: CENTRE_X, y: CENTRE_Y}]);
        });

        it("should leave the plant's tiles as they are", () => {
            const {tilesBefore, tilesAfter} = scanPlant();

            expect(tilesAfter).toEqual(tilesBefore);
        });
    });
});
