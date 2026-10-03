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

import { fixtureSave } from "../headless/fixtures/index";
import { advance, startCity } from "../headless/runner";
import { GameMap } from "../src/gameMap.js";
import { Random } from "../src/random";
import { Simulation } from "../src/simulation.js";
import { plainSavedState } from "../src/stateHash";
import { ANIMBIT, CONDBIT } from "../src/tileFlags";
import { FIRE, POWERPLANT } from "../src/tileValues";

type Window = {window?: unknown};
type Save = Record<string, unknown>;

// storage.js reads window.localStorage when it loads, and the tests run in Node: stub the window, then import it
async function loadStorage() {
    (globalThis as Window).window = {localStorage: {}};
    return (await import("../src/storage.js")).Storage;
}

const SEED = 2026;

// The keys the game itself saves beside the simulation, and the version storage.js adds
const GAME_KEYS = ["version", "name", "autoBulldoze"];

// The keys version 4 saved that no save holds any more
const DROPPED_KEYS = ["everClicked"];

// An empty map with one coal plant tile, which a scan counts, and one burning tile, which makes a scan draw from the
// stream and change the map
function plantMap() {
    const map = new GameMap(120, 100);
    map.setTile(60, 50, POWERPLANT, CONDBIT);
    map.setTile(30, 30, FIRE, ANIMBIT);
    return map;
}

// Every tile's raw value, row by row, as a version 4 save held them
function version4Tiles(map: InstanceType<typeof GameMap>) {
    const tiles = [];
    for (let i = 0; i < map.width * map.height; i++) {
        tiles.push({value: map.getTile(i % map.width, Math.floor(i / map.width)).getRawValue()});
    }
    return tiles;
}

// A version 4 save, key by key as version 4 wrote it: written out rather than derived from today's save, so a change
// to today's format can't change it. The values are arbitrary but valid, and distinct where they can be.
function version4Save(tiles = version4Tiles(plantMap())): Save {
    const history = (first: number) => Array.from({length: 120}, (_, i) => first + i);

    return {
        version: 4, name: "Oldtown", everClicked: true, autoBulldoze: true,
        _cityTime: 100, _gameLevel: 1, _speed: 2, _speedCycle: 7, seed: SEED,
        randomState: Random.simulationStream(SEED).getState(),
        width: 120, height: 100, cityCentreX: 61, cityCentreY: 52, pollutionMaxX: 30, pollutionMaxY: 40, map: tiles,
        cityClass: "TOWN", cityScore: 640,
        resValve: 1200, comValve: -300, indValve: 450,
        autoBudget: true, totalFunds: 15000, policePercent: 0.9, roadPercent: 1, firePercent: 0.8, roadSpend: 51,
        policeSpend: 91, fireSpend: 81, roadMaintenanceBudget: 52, policeMaintenanceBudget: 101,
        fireMaintenanceBudget: 102, cityTax: 8, roadEffect: 31, policeEffect: 900, fireEffect: 800,
        resPop: 120, comPop: 40, indPop: 60, crimeRamp: 20, pollutionRamp: 30, landValueAverage: 70,
        pollutionAverage: 25, crimeAverage: 15, totalPop: 22,
        resHist10: history(0), resHist120: history(1000), comHist10: history(2000), comHist120: history(3000),
        indHist10: history(4000), indHist120: history(5000), crimeHist10: history(6000), crimeHist120: history(7000),
        moneyHist10: history(8000), moneyHist120: history(9000), pollutionHist10: history(10000),
        pollutionHist120: history(11000),
    };
}

// A save of an older version: version 4's, less what each later version added
function oldSave(version: number): Save {
    const saveData = version4Save();
    const added: Record<number, string[]> = {
        1: ["everClicked"],
        2: ["pollutionMaxX", "pollutionMaxY", "cityCentreX", "cityCentreY"],
        3: ["seed", "randomState", "_speedCycle"],
    };

    for (let laterVersion = version; laterVersion <= 3; laterVersion++) {
        added[laterVersion].forEach((key) => delete saveData[key]);
    }
    saveData.version = version;
    return saveData;
}

// Every key path in a save, following objects and the elements of arrays
function keyPaths(value: unknown, path = ""): string[] {
    if (Array.isArray(value)) {
        return Array.from(new Set(value.flatMap((element) => keyPaths(element, `${path}[]`))));
    }

    if (value !== null && typeof value === "object") {
        return Object.entries(value).flatMap(([key, child]) => [`${path}.${key}`, ...keyPaths(child, `${path}.${key}`)]);
    }

    return [];
}

// A new city's simulation state, as a save holds it
function simulationSave() {
    return plainSavedState(new Simulation(plantMap(), Simulation.LEVEL_EASY, Simulation.SPEED_MED, 1)) as Save;
}

// A migrated save's key paths, and those a current save holds: the simulation's, and the game's own. The scanned state
// is null in a migrated save, and derived when it loads, so neither list holds the keys under it.
function migratedAndCurrentKeys(migrated: Save) {
    const outsideScannedState = (paths: string[]) => paths.filter((path) => !path.startsWith(".scannedState."));
    const current = [...keyPaths(simulationSave()), ...GAME_KEYS.map((key) => `.${key}`)];
    return [outsideScannedState(keyPaths(migrated)).sort(), outsideScannedState(current).sort()];
}

describe("storage", () => {

    afterAll(() => {
        delete (globalThis as Window).window;
    });

    describe.each([1, 2, 3])("when migrating a version %i save", (version) => {

        it("gives it a uint32 seed and the simulation stream of that seed", async () => {
            const Storage = await loadStorage();
            const savedGame = oldSave(version);

            Storage.transitionOldSave(savedGame);

            const {seed, randomState} = savedGame.simulation as {seed: number, randomState: number[]};
            expect(Number.isInteger(seed)).toBe(true);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThanOrEqual(0xffffffff);
            expect(randomState).toEqual(Random.simulationStream(seed).getState());
        });

        it("starts its speed cycle from 0", async () => {
            const Storage = await loadStorage();
            const savedGame = oldSave(version);

            Storage.transitionOldSave(savedGame);

            expect((savedGame.simulation as {speedCycle: number}).speedCycle).toBe(0);
        });
    });

    it.each([1, 2, 3, 4])("gives a migrated version %i save exactly the keys a current save holds, at every level",
        async (version) => {
            const Storage = await loadStorage();
            const savedGame = oldSave(version);

            Storage.transitionOldSave(savedGame);

            const [migrated, current] = migratedAndCurrentKeys(savedGame);
            expect(migrated).toEqual(current);
        });

    describe("when migrating a version 4 save", () => {

        // Each value turns up under its own name, without a leading underscore, in one of the current save's groups
        it("keeps every value it holds through a load", async () => {
            const Storage = await loadStorage();
            const savedGame = version4Save();
            const version4 = JSON.parse(JSON.stringify(savedGame)) as Save;
            Storage.transitionOldSave(savedGame);

            const restored = plainSavedState(Simulation.fromSave(savedGame)) as Record<string, Save>;

            const groups = Object.values(restored).filter((group) => group !== null && typeof group === "object");
            for (const [key, value] of Object.entries(version4)) {
                if (GAME_KEYS.includes(key) || DROPPED_KEYS.includes(key) || key === "map") {
                    continue;
                }
                const name = key.replace(/^_/, "");
                expect([key, groups.filter((group) => name in group).map((group) => group[name])])
                    .toEqual([key, [value]]);
            }
            expect(restored.map.tiles).toEqual((version4.map as {value: number}[]).map((tile) => tile.value));
        });

        it("loads it by scanning for what it lacks, then restoring the save over what the scan changed", async () => {
            const Storage = await loadStorage();
            const savedGame = version4Save();
            Storage.transitionOldSave(savedGame);

            // Loaded over a city whose own scan has already counted a coal plant
            const city = new Simulation(plantMap(), Simulation.LEVEL_EASY, Simulation.SPEED_MED, 1);
            city.load(savedGame);
            const restored = plainSavedState(city) as {
                scannedState: {census: {coalPowerPop: number}}, sprites: {list: unknown[]}};

            // The scan counted the save's one coal plant, and nothing the city counted before
            expect(restored.scannedState.census.coalPowerPop).toBe(1);
            expect(restored.sprites.list).toEqual([]);
        });

        // The town's zones and traffic add to block maps such as the rate of growth as the load's scan runs, and so
        // did the grown city it is loaded over: none of that city's additions may survive
        it("loads to the same state over a grown city as over a blank one", async () => {
            const Storage = await loadStorage();
            const townTiles = fixtureSave("town").map as unknown as {tiles: number[]};
            const savedGame = version4Save(townTiles.tiles.map((value) => ({value})));
            Storage.transitionOldSave(savedGame);
            const grown = startCity({fixture: "town", reseed: 2, speed: "fast"});
            advance(grown, 2000);

            grown.load(JSON.parse(JSON.stringify(savedGame)));

            expect(plainSavedState(grown)).toEqual(plainSavedState(Simulation.fromSave(savedGame)));
        });
    });

    describe("when migrating a version 5 save", () => {

        it("drops the donation flag, and keeps every other key and value", async () => {
            const Storage = await loadStorage();
            const version5 = {...simulationSave(), version: 5, name: "Newtown", autoBulldoze: false, everClicked: true};
            const savedGame = JSON.parse(JSON.stringify(version5)) as Save;

            Storage.transitionOldSave(savedGame);

            delete (version5 as Save).everClicked;
            expect(savedGame).toEqual(version5);
        });
    });
});
