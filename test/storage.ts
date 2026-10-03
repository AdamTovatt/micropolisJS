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

import { advance, fixtureSave, startCity } from "../headless/runner";
import { AUTO_BULLDOZE_KEY } from "../src/autoBulldozePreference";
import { Budget } from "../src/budget.js";
import { GameMap } from "../src/gameMap.js";
import { Random } from "../src/random";
import { Simulation } from "../src/simulation.js";
import { plainSavedState } from "../src/stateHash";
import { ANIMBIT, CONDBIT } from "../src/tileFlags";
import { FIRE, POWERPLANT } from "../src/tileValues";
import { removeWindow, stubWindow } from "./helpers/window";

type Save = Record<string, unknown>;

async function loadStorage() {
    const localStorage = stubWindow();
    const Storage = (await import("../src/storage.js")).Storage;

    // Defined as a constant property, which the type of the module doesn't show
    const currentVersion = (Storage as unknown as {CURRENT_VERSION: number}).CURRENT_VERSION;
    const key = (Storage as unknown as {KEY: string}).KEY;

    return {Storage, localStorage, currentVersion, key};
}

const SEED = 2026;

// The keys the game itself saves beside the simulation, and the version storage.js adds
const GAME_KEYS = ["version", "name"];

// The keys version 4 saved that no save holds any more
const DROPPED_KEYS = ["everClicked", "autoBulldoze"];

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
        removeWindow();
    });

    describe("save text", () => {

        it("is the save data stamped with the current version", async () => {
            const {Storage, currentVersion} = await loadStorage();

            expect(JSON.parse(Storage.serialise({name: "Town", _cityTime: 12})))
                .toEqual({name: "Town", _cityTime: 12, version: currentVersion});
        });

        it("reads back as what was written", async () => {
            const {Storage, currentVersion} = await loadStorage();

            const savedGame = Storage.parse(Storage.serialise({name: "Town", _cityTime: 12}));

            expect(savedGame).toEqual({name: "Town", _cityTime: 12, version: currentVersion});
        });

        it("migrates an old version as it reads it", async () => {
            const {Storage} = await loadStorage();

            const savedGame = Storage.parse(JSON.stringify(oldSave(3)));

            expect(savedGame.simulation.speedCycle).toBe(0);
        });

        it("refuses text that isn't JSON", async () => {
            const {Storage} = await loadStorage();

            expect(() => Storage.parse("not a save")).toThrow(SyntaxError);
        });

        it("refuses a version it doesn't know", async () => {
            const {Storage} = await loadStorage();

            expect(() => Storage.parse(JSON.stringify({version: 99}))).toThrow("Unknown save version!");
        });
    });

    describe("the saved game", () => {

        it("is stored as save text", async () => {
            const {Storage, localStorage, key} = await loadStorage();

            Storage.saveGame({name: "Town"});

            expect(localStorage.getItem(key)).toBe(Storage.serialise({name: "Town"}));
        });

        it("reads back from storage", async () => {
            const {Storage, currentVersion} = await loadStorage();
            Storage.saveGame({name: "Town"});

            expect(Storage.getSavedGame()).toEqual({name: "Town", version: currentVersion});
        });

        it("is null when nothing is saved", async () => {
            const {Storage} = await loadStorage();

            expect(Storage.getSavedGame()).toBeNull();
        });
    });

    describe.each([1, 2, 3])("when migrating a version %i save", (version) => {

        it("gives it a uint32 seed and the simulation stream of that seed", async () => {
            const {Storage} = await loadStorage();
            const savedGame = oldSave(version);

            Storage.transitionOldSave(savedGame);

            const {seed, randomState} = savedGame.simulation as {seed: number, randomState: number[]};
            expect(Number.isInteger(seed)).toBe(true);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThanOrEqual(0xffffffff);
            expect(randomState).toEqual(Random.simulationStream(seed).getState());
        });

        it("starts its speed cycle from 0", async () => {
            const {Storage} = await loadStorage();
            const savedGame = oldSave(version);

            Storage.transitionOldSave(savedGame);

            expect((savedGame.simulation as {speedCycle: number}).speedCycle).toBe(0);
        });
    });

    it.each([1, 2, 3, 4])("gives a migrated version %i save exactly the keys a current save holds, at every level",
        async (version) => {
            const {Storage} = await loadStorage();
            const savedGame = oldSave(version);

            Storage.transitionOldSave(savedGame);

            const [migrated, current] = migratedAndCurrentKeys(savedGame);
            expect(migrated).toEqual(current);
        });

    describe("when migrating a version 4 save", () => {

        // Each value turns up under its own name, without a leading underscore, in one of the current save's groups
        it("keeps every value it holds through a load", async () => {
            const {Storage} = await loadStorage();
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
            const {Storage} = await loadStorage();
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
            const {Storage} = await loadStorage();
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

        // Version 8 then drops the auto-bulldoze setting
        it("drops the donation flag, and keeps every other key and value but auto-bulldoze", async () => {
            const {Storage} = await loadStorage();
            const version5 = {...simulationSave(), version: 5, name: "Newtown", autoBulldoze: false, everClicked: true};
            const savedGame = JSON.parse(JSON.stringify(version5)) as Save;

            Storage.transitionOldSave(savedGame);

            delete (version5 as Save).everClicked;
            delete (version5 as Save).autoBulldoze;
            expect(savedGame).toEqual(version5);
        });
    });

    // A version 5 or 6 save stands in as a current save without the breakdown, which version 7 added, and for
    // version 5 with the donation flag
    function saveBeforeBreakdown(version: number): Save {
        if (version <= 4) {
            return oldSave(version);
        }

        const saveData = simulationSave();
        delete (saveData.evaluation as Save).cityScoreBreakdown;
        saveData.version = version;
        if (version === 5) {
            saveData.everClicked = true;
        }
        return saveData;
    }

    describe.each([1, 2, 3, 4, 5, 6])("when migrating a version %i save", (version) => {

        it("gives it an empty score breakdown", async () => {
            const {Storage} = await loadStorage();
            const savedGame = saveBeforeBreakdown(version);

            Storage.transitionOldSave(savedGame);

            expect((savedGame.evaluation as Save).cityScoreBreakdown).toEqual([]);
        });
    });

    // getSavedGame migrates only a save whose version differs from the current one
    it("migrates a stored version 6 save when it reads it", async () => {
        const {Storage, localStorage, key} = await loadStorage();
        localStorage.setItem(key, JSON.stringify(saveBeforeBreakdown(6)));

        const savedGame = Storage.getSavedGame() as unknown as Save;

        expect((savedGame.evaluation as Save).cityScoreBreakdown).toEqual([]);
    });

    describe("when migrating a version 7 save", () => {

        type Version7Save = Record<string, unknown> & {budget: Record<string, unknown>};

        // The town as version 7 saved it, with the game's auto-bulldoze setting, and a budget that also held whether it
        // waited for the player, with the budget fields given
        function version7Save(budget: Record<string, unknown>): Version7Save {
            const saved = fixtureSave("town") as unknown as Version7Save;
            return {...saved, version: 7, autoBulldoze: false,
                    budget: {...saved.budget, awaitingValues: false, ...budget}};
        }

        // The save is migrated on every page load, so a setting it held must never overwrite the one the player chose
        it.each([true, false])("leaves the player's auto-bulldoze preference as it is, the save holding %s",
                               async (on) => {
            const {Storage, localStorage} = await loadStorage();
            localStorage.setItem(AUTO_BULLDOZE_KEY, String(!on));

            Storage.transitionOldSave({...version7Save({}), autoBulldoze: on});

            expect(localStorage.getItem(AUTO_BULLDOZE_KEY)).toBe(String(!on));
        });

        it("leaves it as a save of the current version holds it, without the auto-bulldoze setting", async () => {
            const {Storage} = await loadStorage();
            const savedGame = version7Save({});

            Storage.transitionOldSave(savedGame);

            expect(savedGame).toEqual({...fixtureSave("town"), version: 7});
        });

        // Road upkeep of 100, fully funded, and 300 of tax to come in
        it("pays the year-end budget that a save waited on, with the values it holds", async () => {
            const {Storage} = await loadStorage();
            const savedGame = version7Save({awaitingValues: true, autoBudget: false, totalFunds: 1000, taxFund: 300,
                                            roadMaintenanceBudget: 100, fireMaintenanceBudget: 0,
                                            policeMaintenanceBudget: 0, roadPercent: 1, roadSpend: 0, roadEffect: 0});

            Storage.transitionOldSave(savedGame);

            const {budget} = savedGame;
            expect(budget).not.toHaveProperty("awaitingValues");
            expect([budget.totalFunds, budget.roadSpend, budget.roadEffect, budget.autoBudget])
                .toEqual([1000 + 300 - 100, 100, new Budget().MAX_ROAD_EFFECT, false]);
        });
    });

    describe("when migrating a version 8 save", () => {

        // The town, with the problems an evaluation wrote: every problem in vote order, null for none past the worst
        function version8Save(problemOrder: (number | null)[]): Save {
            const saved = fixtureSave("town") as unknown as Save;
            return {...saved, version: 8, evaluation: {...(saved.evaluation as Save), problemOrder}};
        }

        it.each([
            [[3, 0, null, null, null, null, null], [3, 0, 7, 7]],
            [[0, 1, 2, 4, null, null, null], [0, 1, 2, 4]],
            [[7, 7, 7, 7], [7, 7, 7, 7]],
        ])("keeps the worst four problems of %j, with 7 for none", async (problemOrder, migrated) => {
            const {Storage} = await loadStorage();
            const savedGame = version8Save(problemOrder);

            Storage.transitionOldSave(savedGame);

            expect((savedGame.evaluation as Save).problemOrder).toEqual(migrated);
        });
    });
});
