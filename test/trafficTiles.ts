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

import { plainRoad } from "../src/trafficTiles";
import { BRWV, HBRIDGE, HPOWER, HTRFBASE, INTERSECTION, LTRFBASE, ROADBASE, ROADS, TILE_COUNT, VBRIDGE, VROADPOWER }
    from "../src/tileValues";

// The first tile id of each run of sixteen traffic tiles the rules' road rule and the animation table hold: light
// traffic and its three frames, then heavy traffic and its three
const TRAFFIC_RUNS = [80, 96, 112, 128, 144, 160, 176, 192];

// The open vertical drawbridge and its frames, the sixteenth of each run, on which no traffic runs
const DRAWBRIDGE = [95, 111, 127, 143, 159, 175, 191, 207];

describe("plainRoad", () => {
    it("draws the first fifteen of each run of traffic as the road tile of the same place from ROADBASE", () => {
        const wrong: string[] = [];
        for (const run of TRAFFIC_RUNS) {
            for (let shape = 0; shape < 15; shape++) {
                if (plainRoad(run + shape) !== ROADBASE + shape) {
                    wrong.push(`${run + shape} as ${plainRoad(run + shape)}`);
                }
            }
        }

        expect(wrong).toEqual([]);
    });

    it.each([
        ["light traffic on a horizontal bridge", LTRFBASE, HBRIDGE],
        ["a heavy-traffic frame on a vertical bridge", 192 + 1, VBRIDGE],
        ["heavy traffic on a plain road", HTRFBASE + (ROADS - ROADBASE), ROADS],
        ["a light-traffic frame on an intersection", 112 + (INTERSECTION - ROADBASE), INTERSECTION],
        ["a heavy-traffic frame on road crossing a power line", 206, VROADPOWER],
    ])("draws %s as it", (_, tile, road) => {
        expect(plainRoad(tile)).toBe(road);
    });

    it("draws the open vertical drawbridge and its frames as themselves", () => {
        expect(DRAWBRIDGE.map(plainRoad)).toEqual(DRAWBRIDGE);
        expect(plainRoad(BRWV)).toBe(BRWV);
    });

    it("draws every tile outside traffic's ids as itself", () => {
        const changed: number[] = [];
        for (let tile = 0; tile < TILE_COUNT; tile++) {
            if ((tile < 80 || tile > 207) && plainRoad(tile) !== tile) {
                changed.push(tile);
            }
        }

        expect(changed).toEqual([]);
        expect(plainRoad(HPOWER)).toBe(HPOWER);
    });
});
