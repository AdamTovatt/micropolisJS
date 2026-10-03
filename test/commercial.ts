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

import { Commercial } from "../src/commercial.js";
import { TileUtils } from "../src/tileUtils.js";
import { COMCLR, CZB, INDBASE, ROADS } from "../src/tileValues";
import { ZoneUtils } from "../src/zoneUtils.js";
import { registeredHandler } from "./helpers/handlers";
import { streamDrawing } from "./helpers/streams";
import { makeMap, makeSimData } from "./helpers/zoneCity";

describe("a commercial zone", () => {

    // A powered zone of the lowest population, with a road on the west end of its northern edge
    const ZONE_X = 20;
    const ZONE_Y = 20;
    const ROAD_X = ZONE_X - 1;
    const ROAD_Y = ZONE_Y - 2;

    // Land valuable enough for the zone to grow a level, and strong demand
    const LAND_VALUE = 64;
    const STRONG_DEMAND = 1500;

    // A rate of growth's step for each level a zone grows or declines: incRateOfGrowth's 8, times its scale of 4
    const LEVEL_OF_GROWTH = 8 * 4;

    // The draws, each test giving exactly those its zone takes, so a draw too many fails it: getRandom(5) of 0, so a
    // zone of population 1 drives; getChance(7), which 0 passes, so the zone is assessed; and getRandom16Signed of
    // -32768, under any score a zone can grow at, or of 32767, over any score a zone can decline at
    const DRIVE = 0;
    const ASSESS = 0;
    const GROW = 0x8000;
    const DECLINE = 0x7fff;

    // A zone of the given centre tile under the given demand, whose road on the perimeter leads to the destination
    // tile, or nowhere
    function makeCity(centreTile: number, roadLeadsTo: number | null, demand: number, draws: number[]) {
        const map = makeMap();
        ZoneUtils.putZone(map, ZONE_X, ZONE_Y, centreTile, true);
        map.setTile(ROAD_X, ROAD_Y, ROADS, 0);
        if (roadLeadsTo !== null) {
            // The road goes on west a tile, to the destination north of it
            map.setTile(ROAD_X - 1, ROAD_Y, ROADS, 0);
            map.setTile(ROAD_X - 1, ROAD_Y - 1, roadLeadsTo, 0);
        }

        const simData = makeSimData(map, streamDrawing(draws));
        simData.blockMaps.landValueMap.worldSet(ZONE_X, ZONE_Y, LAND_VALUE);
        simData.valves.comValve = demand;
        return {map, simData};
    }

    function population(map: ReturnType<typeof makeMap>) {
        return Commercial.getZonePopulation(map, ZONE_X, ZONE_Y, map.getTileValue(ZONE_X, ZONE_Y));
    }

    function rateOfGrowth(simData: ReturnType<typeof makeSimData>) {
        return simData.blockMaps.rateOfGrowthMap.worldGet(ZONE_X, ZONE_Y);
    }

    it("should grow when its drive reaches industry", () => {
        const {map, simData} = makeCity(CZB, INDBASE, STRONG_DEMAND, [DRIVE, ASSESS, GROW]);

        registeredHandler(Commercial.registerHandlers, TileUtils.isCommercialZone)(map, ZONE_X, ZONE_Y, simData);

        expect(population(map)).toBe(2);
        expect(rateOfGrowth(simData)).toBe(LEVEL_OF_GROWTH);
    });

    // As doCommercial in the original: TrfGood, 0 when the drive found no route, guards the growth, which then draws
    // nothing; under strong demand the zone doesn't decline either, and draws nothing to decide it
    it("should not grow, nor draw to grow, when its drive finds no route", () => {
        const {map, simData} = makeCity(CZB, null, STRONG_DEMAND, [DRIVE, ASSESS]);

        registeredHandler(Commercial.registerHandlers, TileUtils.isCommercialZone)(map, ZONE_X, ZONE_Y, simData);

        expect(population(map)).toBe(1);
        expect(rateOfGrowth(simData)).toBe(0);
    });

    // Only the growth is guarded: a zone whose drive finds no route still declines under weak demand
    it("should decline under weak demand when its drive finds no route", () => {
        const {map, simData} = makeCity(CZB, null, -STRONG_DEMAND, [DRIVE, ASSESS, DECLINE]);

        registeredHandler(Commercial.registerHandlers, TileUtils.isCommercialZone)(map, ZONE_X, ZONE_Y, simData);

        expect(map.getTileValue(ZONE_X, ZONE_Y)).toBe(COMCLR);
        expect(rateOfGrowth(simData)).toBe(-LEVEL_OF_GROWTH);
    });
});
