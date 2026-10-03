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

import { GameMap } from "../src/gameMap.js";
import { Random } from "../src/random";
import { Simulation } from "../src/simulation.js";
import { plainSavedState } from "../src/stateHash";
import { ANIMBIT, CONDBIT } from "../src/tileFlags";
import { FIRE, POWERPLANT } from "../src/tileValues";

type Window = {window?: unknown};

// storage.js reads window.localStorage when it loads, and the tests run in Node: stub the window, then import it
async function loadStorage() {
    (globalThis as Window).window = {localStorage: {}};
    return (await import("../src/storage.js")).Storage;
}

describe("storage", () => {

    afterAll(() => {
        delete (globalThis as Window).window;
    });

    describe.each([1, 2, 3])("when migrating a version %i save", (version) => {

        it("gives it a uint32 seed and the simulation stream of that seed", async () => {
            const Storage = await loadStorage();
            const savedGame: {version: number, seed?: number, randomState?: number[]} = {version};

            Storage.transitionOldSave(savedGame);

            expect(Number.isInteger(savedGame.seed)).toBe(true);
            expect(savedGame.seed).toBeGreaterThanOrEqual(0);
            expect(savedGame.seed).toBeLessThanOrEqual(0xffffffff);
            expect(savedGame.randomState).toEqual(Random.simulationStream(savedGame.seed!).getState());
        });

        it("starts its speed cycle from 0", async () => {
            const Storage = await loadStorage();
            const savedGame: {version: number, _speedCycle?: number} = {version};

            Storage.transitionOldSave(savedGame);

            expect(savedGame._speedCycle).toBe(0);
        });
    });

    describe("when migrating a version 4 save", () => {

        const VERSION_5_KEYS = ["_phaseCycle", "_simCycle", "_cityPopLast", "_messageLast",
                                "_initialEvaluationPending", "evaluation", "valves", "budget", "sprites", "disasters",
                                "scannedState"];

        // An empty city with one coal plant tile, which a scan counts, and one burning tile, which makes a scan draw
        // from the stream and change the map
        function newCity() {
            const map = new GameMap(120, 100);
            map.setTile(60, 50, POWERPLANT, CONDBIT);
            map.setTile(30, 30, FIRE, ANIMBIT);
            return new Simulation(map, Simulation.LEVEL_EASY, Simulation.SPEED_MED, 1, null);
        }

        // What a version 5 save holds, less what version 5 added
        function version4Save() {
            const saveData = plainSavedState(newCity()) as Record<string, unknown>;
            VERSION_5_KEYS.forEach((key) => delete saveData[key]);
            saveData.version = 4;
            return saveData;
        }

        // Every key path in a save, following objects and the elements of arrays
        function keyPaths(value: unknown, path = ""): string[] {
            if (Array.isArray(value)) {
                return Array.from(new Set(value.flatMap((element) => keyPaths(element, `${path}[]`))));
            }

            if (value !== null && typeof value === "object") {
                return Object.entries(value).flatMap(([key, child]) => [`${path}.${key}`,
                                                                        ...keyPaths(child, `${path}.${key}`)]);
            }

            return [];
        }

        // The scanned state is null in a migrated save, and derived when it loads
        const outsideScannedState = (paths: string[]) => paths.filter((path) => !path.startsWith(".scannedState."));

        it("gives it every key a version 5 save holds, at every level", async () => {
            const Storage = await loadStorage();
            const savedGame = version4Save();

            Storage.transitionOldSave(savedGame);

            expect(outsideScannedState(keyPaths(savedGame)).sort())
                .toEqual(outsideScannedState([...keyPaths(plainSavedState(newCity())), ".version"]).sort());
        });

        it("loads it by scanning for what it lacks, then restoring the save over what the scan changed", async () => {
            const Storage = await loadStorage();
            const savedGame = version4Save();
            const {map, randomState} = JSON.parse(JSON.stringify(savedGame));
            Storage.transitionOldSave(savedGame);

            const restored = plainSavedState(new Simulation(new GameMap(120, 100), null, null, null, savedGame)) as {
                map: unknown, randomState: number[], scannedState: {census: {coalPowerPop: number}},
                sprites: {list: unknown[]}};

            expect(restored.map).toEqual(map);
            expect(restored.randomState).toEqual(randomState);
            // The scan counted the one coal plant
            expect(restored.scannedState.census.coalPowerPop).toBe(1);
            expect(restored.sprites.list).toEqual([]);
        });
    });
});
