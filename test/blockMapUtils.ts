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
import { BlockMapUtils } from "../src/blockMapUtils.js";

describe("the block map utilities", () => {

    describe("when scanning for crime", () => {

        const MAP_WIDTH = 120;
        const MAP_HEIGHT = 100;

        function makeBlockMaps() {
            return {
                crimeRateMap: new BlockMap(MAP_WIDTH, MAP_HEIGHT, 2),
                landValueMap: new BlockMap(MAP_WIDTH, MAP_HEIGHT, 2),
                policeStationEffectMap: new BlockMap(MAP_WIDTH, MAP_HEIGHT, 8),
                policeStationMap: new BlockMap(MAP_WIDTH, MAP_HEIGHT, 8),
                populationDensityMap: new BlockMap(MAP_WIDTH, MAP_HEIGHT, 2),
            };
        }

        // With no population or police nearby, developed land's crime rate is 128 minus its land value
        const LAND_VALUE = 28;
        const CRIME_RATE = 128 - LAND_VALUE;

        it("should give developed land a crime rate", () => {
            const blockMaps = makeBlockMaps();
            blockMaps.landValueMap.worldSet(20, 20, LAND_VALUE);

            BlockMapUtils.crimeScan({crimeAverage: 0}, blockMaps);

            expect(blockMaps.crimeRateMap.worldGet(20, 20)).toBe(CRIME_RATE);
        });

        it("should scan up to the far corner of the map", () => {
            const blockMaps = makeBlockMaps();
            blockMaps.landValueMap.worldSet(MAP_WIDTH - 2, MAP_HEIGHT - 2, LAND_VALUE);

            BlockMapUtils.crimeScan({crimeAverage: 0}, blockMaps);

            expect(blockMaps.crimeRateMap.worldGet(MAP_WIDTH - 2, MAP_HEIGHT - 2)).toBe(CRIME_RATE);
        });

        it("should average the crime rate over developed land", () => {
            const blockMaps = makeBlockMaps();
            const otherLandValue = 78;
            blockMaps.landValueMap.worldSet(20, 20, LAND_VALUE);
            blockMaps.landValueMap.worldSet(40, 40, otherLandValue);
            const census = {crimeAverage: 0};

            BlockMapUtils.crimeScan(census, blockMaps);

            expect(census.crimeAverage).toBe((CRIME_RATE + (128 - otherLandValue)) / 2);
        });

        // The cap of 300 on crime before the police shows only where the police then take it below 250. The C#
        // CrimeScan pins the same input to the same rate (BlockMapUtilsTests), since no fixture's city reaches it.
        it("should cap crime at 300 before the police take from it", () => {
            const blockMaps = makeBlockMaps();
            blockMaps.landValueMap.worldSet(60, 48, 10);
            blockMaps.populationDensityMap.worldSet(60, 48, 250);

            // Police cover of 100 everywhere, which smoothing leaves at 100 away from the map's edges
            for (let x = 0; x < MAP_WIDTH; x += 8) {
                for (let y = 0; y < MAP_HEIGHT; y += 8) {
                    blockMaps.policeStationMap.worldSet(x, y, 100);
                }
            }

            BlockMapUtils.crimeScan({crimeAverage: 0}, blockMaps);

            // 128 - 10 + 250 = 368, capped at 300, less the police
            expect(blockMaps.crimeRateMap.worldGet(60, 48)).toBe(200);
        });
    });
});
