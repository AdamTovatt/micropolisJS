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
import { GameMap } from "../src/gameMap.js";
import { MapScanner } from "../src/mapScanner.js";
import { MiscTiles } from "../src/miscTiles.js";
import { ANIMBIT, BLBNBIT, BNCNBIT, BULLBIT, ZONEBIT } from "../src/tileFlags";
import { TileUtils } from "../src/tileUtils.js";
import { DIRT, FIRE, IZB, LASTTINYEXP, RUBBLE, RZB, TINYEXP, WOODS } from "../src/tileValues";
import { registeredHandler } from "./helpers/handlers";
import { streamAlwaysDrawing, streamDrawing } from "./helpers/streams";


describe("miscellaneous tiles", () => {

    describe("when a fire burns", () => {

        const FIRE_X = 10;
        const FIRE_Y = 10;
        const NEIGHBOUR_X = FIRE_X + 1;

        // Every draw is 8: its low three bits are clear, so the fire always spreads, to every neighbour, as a plain
        // FIRE tile; and 8 modulo the burn-out range is never 0, so it never burns out
        const SPREAD_NEVER_BURN_OUT = 8;

        function makeMap(neighbourValue: number, neighbourFlags: number) {
            const map = new GameMap(120, 100);
            map.setTile(FIRE_X, FIRE_Y, FIRE, 0);
            map.setTile(NEIGHBOUR_X, FIRE_Y, neighbourValue, neighbourFlags);
            return map;
        }

        function burn(map: InstanceType<typeof GameMap>) {
            const simData = {
                blockMaps: {
                    fireStationEffectMap: new BlockMap(120, 100, 8),
                    rateOfGrowthMap: new BlockMap(120, 100, 8),
                },
                census: {firePop: 0},
                random: streamAlwaysDrawing(SPREAD_NEVER_BURN_OUT),
                spriteManager: {makeExplosion: jest.fn()},
            };
            registeredHandler(MiscTiles.registerHandlers, TileUtils.isFire)(map, FIRE_X, FIRE_Y, simData);
            return simData.spriteManager.makeExplosion;
        }

        it("should set a burnable neighbour on fire", () => {
            const map = makeMap(WOODS, BLBNBIT);

            burn(map);

            expect(map.getTileValue(NEIGHBOUR_X, FIRE_Y)).toBe(FIRE);
        });

        it("should leave a neighbour that cannot burn", () => {
            const map = makeMap(DIRT, 0);

            burn(map);

            expect(map.getTileValue(NEIGHBOUR_X, FIRE_Y)).toBe(DIRT);
        });

        it("should set a burnable zone on fire without an explosion", () => {
            const map = makeMap(RZB, BNCNBIT | ZONEBIT);

            const makeExplosion = burn(map);

            expect(map.getTileValue(NEIGHBOUR_X, FIRE_Y)).toBe(FIRE);
            expect(makeExplosion).not.toHaveBeenCalled();
        });

        it("should blow up an industrial zone it sets on fire", () => {
            const map = makeMap(IZB + 1, BNCNBIT | ZONEBIT);

            const makeExplosion = burn(map);

            expect(map.getTileValue(NEIGHBOUR_X, FIRE_Y)).toBe(FIRE);
            expect(makeExplosion).toHaveBeenCalledWith(NEIGHBOUR_X, FIRE_Y);
        });
    });

    describe("when the scan finds an explosion", () => {

        const FRAMES = Array.from({length: LASTTINYEXP - TINYEXP + 1}, (_, i) => TINYEXP + i);

        it.each(FRAMES)("should turn explosion tile %i into the rubble its one draw picks", (explosion) => {
            const map = new GameMap(120, 100);
            map.setTile(10, 10, explosion, ANIMBIT | BULLBIT);
            const scanner = new MapScanner(map);
            MiscTiles.registerHandlers(scanner);

            scanner.mapScan(10, 11, {random: streamDrawing([2])});

            expect(map.getTileValue(10, 10)).toBe(RUBBLE + 2);
            expect(map.getTileFlags(10, 10)).toBe(BULLBIT);
        });

        it.each([TINYEXP - 1, LASTTINYEXP + 1])("should leave tile %i, just outside the explosion's frames, alone",
                                                 (neighbour) => {
            const map = new GameMap(120, 100);
            map.setTile(10, 10, neighbour, ANIMBIT | BULLBIT);
            const scanner = new MapScanner(map);
            MiscTiles.registerHandlers(scanner);

            scanner.mapScan(10, 11, {random: streamDrawing([])});

            expect(map.getTileValue(10, 10)).toBe(neighbour);
        });
    });
});
