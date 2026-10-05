/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

import { SPEEDS } from "../src/protocol";
import { SPEED_RADIOS, speedRadioID } from "../src/settingsWindow";
import { repositoryPath } from "./helpers/repository";

// The window shows the city's speed as the settings record gives it, paused included, as the pause button does
describe("the settings window's speed radio buttons", () => {

    // The page's markup, which has each radio button
    const page = readFileSync(repositoryPath("index.html"), "utf8");

    it.each(Object.entries(SPEEDS))("include one for the %s speed", (_, speed) => {
        expect(page).toContain(`id="${speedRadioID(speed)}"`);
    });

    it("are one for each speed, paused first", () => {
        expect(SPEED_RADIOS.map(({speed}) => speed).sort()).toEqual(Object.values(SPEEDS).sort());
        expect(SPEED_RADIOS[0].speed).toBe(SPEEDS.paused);
    });

    it("are none for a speed the city has no such setting for", () => {
        const unknown = Math.max(...Object.values(SPEEDS)) + 1;

        expect(() => speedRadioID(unknown)).toThrow(`no radio button for the speed ${unknown}`);
    });
});
