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

import * as RuleNumbers from "../e2e/ruleNumbers";
import * as Messages from "../src/messages";
import { CITY_CLASSES, SCORE_REASONS } from "../src/protocol";
import { SPRITE_SHEET } from "../src/renderManifest";
import * as TileFlags from "../src/tileFlags";
import * as TileValues from "../src/tileValues";
import { repositoryJson } from "./helpers/repository";
import { RULES, spriteType } from "./helpers/ruleConstants";

// The vocabulary the client shares with the server's rules, against the conformance files the C# tests hold the rules'
// own definitions to (conformance/README.md): the tile ids and flag bits, by which the client draws and reads tiles;
// the names of the city's messages; the city classes and score reasons the evaluation record carries; and the sprite
// types' frames, which the sprite sheet holds; and the numbers the end-to-end specs count with. Each name must have its value in the file, and the client may have no
// name the file lacks.

const tiles = repositoryJson<{values: Record<string, number>, flags: Record<string, number>}>("conformance/tiles.json");
const messages = repositoryJson<{messages: Record<string, unknown>}>("conformance/messages.json");
const saveStrings = repositoryJson<{cityClasses: string[], scoreReasons: string[]}>("conformance/saveStrings.json");

describe("the shared vocabulary", () => {

    it.each([
        ["tile ids", TileValues, tiles.values],
        ["tile flags", TileFlags, tiles.flags],
        ["message names", Messages, messages.messages],
    ])("names the %s as the server's rules do", (_, module, file) => {
        expect(Object.keys(file).length).toBeGreaterThan(0);
        expect({...module}).toEqual(file);
    });

    it("lists the city classes and score reasons as the server's rules do", () => {
        expect([...CITY_CLASSES]).toEqual(saveStrings.cityClasses);
        expect([...SCORE_REASONS]).toEqual(saveStrings.scoreReasons);
    });

    // The sprite sheet's row for each type, from type 1, holds the frames the rules give the type
    it("draws each sprite type with the frames the server's rules give it", () => {
        expect(SPRITE_SHEET.map(({frames}, row) => ({type: row + 1, frames})))
            .toEqual(RULES.spriteTypes.map(({type, frames}) => ({type, frames})));
    });

    it("gives the end-to-end specs the numbers the server's rules count with", () => {
        expect({...RuleNumbers}).toEqual({STEPS_PER_CITY_TIME: RULES.stepsPerCityTime.medium,
                                          CITY_TIMES_PER_YEAR: RULES.cityTimesPerYear,
                                          AIRPORT_COST: RULES.toolCosts.airport,
                                          TORNADO_SPRITE: spriteType("tornado"),
                                          FIRE_COVER_BLOCK_SIZE: RULES.fireCoverBlockSize});
    });
});
