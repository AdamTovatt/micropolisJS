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

import { cityFromSeed, Level, Speed } from "../headless/city";
import { CityBuilder } from "./helpers/cityBuilder";

describe("the tests' city builder", () => {

    const builderOnSeed8 = () => new CityBuilder(cityFromSeed(8, Level.easy, Speed.medium));

    // A zone centred on the corner tile would hang off the map
    it("fails when a tool does", () => {
        expect(() => builderOnSeed8().residential(0, 0))
            .toThrow("The residential tool failed at (0, 0) with outcome failed");
    });

    // The line's first tile is open ground, where the road is laid, and its last the plant's
    it("fails when a line fails at any tile", () => {
        const builder = builderOnSeed8();
        builder.coal(2, 2);

        expect(() => builder.road(0, 1, 1, 1)).toThrow("The road tool failed from (0, 1) to (1, 1) with outcome failed");
    });
});
