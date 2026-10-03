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

import { RUNNING_SPEEDS, Speed } from "../headless/city";
import { type SettingsRecord, SPEEDS } from "../src/protocol";
import { type ClientSettings, shownSpeed, SPEED_RADIOS, speedRadioID } from "../src/settingsWindow";
import { repositoryPath } from "./helpers/repository";

const CITY: SettingsRecord = {type: "settings", autoBudget: true, disasters: false, speed: SPEEDS.fast};
const CLIENT: ClientSettings = {autoBulldoze: true, seed: 8, resumeSpeed: SPEEDS.slow};

describe("the speed the settings window shows", () => {

    it("is the speed the city runs at", () => {
        expect(shownSpeed(CITY, CLIENT)).toBe(SPEEDS.fast);
    });

    it("is the speed Play resumes the city at while it is paused", () => {
        expect(shownSpeed({...CITY, speed: SPEEDS.paused}, CLIENT)).toBe(SPEEDS.slow);
    });
});

describe("the settings window's speed radio buttons", () => {

    // The page's markup, which has each radio button
    const page = readFileSync(repositoryPath("index.html"), "utf8");

    it.each(RUNNING_SPEEDS)("include one for the %s speed", (name) => {
        expect(page).toContain(`id="${speedRadioID(Speed[name])}"`);
    });

    it("are one for each speed the city runs at", () => {
        expect(SPEED_RADIOS.map(({speed}) => speed)).toEqual(RUNNING_SPEEDS.map((name) => Speed[name]));
    });

    it("are none for the paused speed", () => {
        expect(() => speedRadioID(SPEEDS.paused)).toThrow("no radio button for the speed 0");
    });
});
