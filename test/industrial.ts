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

import { Industrial } from "../src/industrial.js";
import { TileUtils } from "../src/tileUtils.js";
import { INDCLR } from "../src/tileValues";
import { ZoneUtils } from "../src/zoneUtils.js";
import { registeredHandler } from "./helpers/handlers";
import { streamDrawing } from "./helpers/streams";
import { ASSESS, DECLINE, DRIVE, makeMap, makeSimData, ZONE_X, ZONE_Y } from "./helpers/zoneCity";

describe("an industrial zone", () => {

    const WEAKEST_DEMAND = -1500;

    // The land value's draw, 0 or 1 by its low bit, which the decline still takes after the zone's other draws
    const LAND_VALUE = 0;

    // As doIndOut in the original, an empty zone that declines is left as it is, and its rate of growth with it
    it("should leave an empty zone that declines as it is", () => {
        const map = makeMap();
        ZoneUtils.putZone(map, ZONE_X, ZONE_Y, INDCLR, true);
        const simData = makeSimData(map, streamDrawing([DRIVE, ASSESS, DECLINE, LAND_VALUE]));
        simData.valves.indValve = WEAKEST_DEMAND;

        registeredHandler(Industrial.registerHandlers, TileUtils.isIndustrialZone)(map, ZONE_X, ZONE_Y, simData);

        expect(map.getTileValue(ZONE_X, ZONE_Y)).toBe(INDCLR);
        expect(simData.blockMaps.rateOfGrowthMap.worldGet(ZONE_X, ZONE_Y)).toBe(0);
    });
});
