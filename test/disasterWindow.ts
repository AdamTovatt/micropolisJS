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

import { readFileSync } from "fs";

import { commandRejection } from "../src/commands";
import { chosenDisaster, disasterOptionID } from "../src/disasterWindow";
import { DISASTER_KINDS } from "../src/protocol";
import { repositoryPath } from "./helpers/repository";

describe("the disaster window's choice", () => {

    it.each([...DISASTER_KINDS])("is the disaster %s, which a triggerDisaster command takes", (kind) => {
        expect(chosenDisaster(kind)).toBe(kind);
        expect(commandRejection({type: "triggerDisaster", kind}, 120, 100)).toBeNull();
    });

    it("is none for the option that triggers none", () => {
        expect(chosenDisaster("none")).toBeNull();
    });

    it("is an error for a value no option has", () => {
        expect(() => chosenDisaster("Monster")).toThrow("No disaster has the option value Monster");
    });
});

describe("the disaster window's options", () => {

    // The page's markup, which names each option
    const page = readFileSync(repositoryPath("index.html"), "utf8");

    it.each([...DISASTER_KINDS])("include one for the disaster %s", (kind) => {
        expect(page).toContain(`id="${disasterOptionID(kind)}"`);
    });

    it("name each disaster's option after it", () => {
        expect(DISASTER_KINDS.map(disasterOptionID)).toEqual([
            "disasterMonster", "disasterFire", "disasterFlood", "disasterCrash", "disasterMeltdown", "disasterTornado",
            "disasterEarthquake",
        ]);
    });
});
