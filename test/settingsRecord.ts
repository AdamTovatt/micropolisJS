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

import { SPEEDS } from "../src/protocol";
import { applyCommand, simulationFromSeed } from "./helpers/simulations";

describe("the settings record", () => {

    it("holds a new city's settings", () => {
        const city = simulationFromSeed(8);

        expect(city.settingsRecord()).toEqual({type: "settings", autoBudget: true, disasters: false, speed: SPEEDS.medium});
    });

    it("holds the settings the player's commands set, the paused speed included", () => {
        const city = simulationFromSeed(8);
        for (const command of [
            {type: "setAutoBudget", on: false}, {type: "setDisasters", on: true}, {type: "setSpeed", speed: 0},
        ] as const) {
            expect(applyCommand(city, command).outcome).toBe("ok");
        }

        expect(city.settingsRecord()).toEqual({type: "settings", autoBudget: false, disasters: true, speed: SPEEDS.paused});
    });
});
