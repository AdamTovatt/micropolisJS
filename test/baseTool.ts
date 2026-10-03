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

import { BaseTool } from "../src/baseTool.js";

const Tools = BaseTool as unknown as {
    getAutoBulldoze(): boolean;
    setAutoBulldoze(value: boolean): void;
    save(saveData: object): void;
    load(saveData: object): void;
};

describe("the tools' shared settings", () => {

    afterEach(() => {
        Tools.setAutoBulldoze(true);
    });

    it.each([true, false])("restore auto-bulldoze %s from a save", (autoBulldoze) => {
        Tools.setAutoBulldoze(autoBulldoze);
        const saveData = {};
        Tools.save(saveData);
        Tools.setAutoBulldoze(!autoBulldoze);

        Tools.load(saveData);

        expect(Tools.getAutoBulldoze()).toBe(autoBulldoze);
    });
});
