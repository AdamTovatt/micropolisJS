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
    });
});
