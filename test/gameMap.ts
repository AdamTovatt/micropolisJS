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
import { BULLBIT, BURNBIT, CONDBIT } from "../src/tileFlags";
import { DIRT, ROADBASE } from "../src/tileValues";

describe("a map", () => {

    // A tile saved without flags, loaded over one with flags: the saved tile has no flags to keep
    it("loads each tile's saved value and flags exactly, whatever the map it is loaded over held", () => {
        const saved = new GameMap(120, 100);
        saved.setTile(10, 10, DIRT, 0);
        const saveData = {};
        saved.save(saveData);

        const map = new GameMap(120, 100);
        map.setTile(10, 10, ROADBASE, BULLBIT | BURNBIT | CONDBIT);
        map.load(JSON.parse(JSON.stringify(saveData)));

        expect(map.getTile(10, 10).getRawValue()).toBe(saved.getTile(10, 10).getRawValue());
    });
});
