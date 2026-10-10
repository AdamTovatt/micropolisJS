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

import { ROAD_EAST, ROAD_NORTH, ROAD_SOUTH, ROAD_WEST, plainRoad, roadWays } from "../src/trafficTiles";
import {
    BRWH, BRWV, DIRT, HBRDG0, HBRDG3, HBRIDGE, HPOWER, HRAILROAD, HROADPOWER, HTRFBASE, INTERSECTION, LHRAIL, LTRFBASE,
    ROADBASE, ROADS, ROADS10, ROADS2, ROADS3, ROADS4, ROADS5, ROADS6, ROADS7, ROADS8, ROADS9, TILE_COUNT, VBRDG0, VBRDG3,
    VBRIDGE, VRAILROAD, VROADPOWER,
} from "../src/tileValues";

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

describe("roadWays", () => {

    // The road the road tool lays where the roads beside it join it by each set of ways, as RoadTable in
    // ConnectingTool.cs gives it, by the ways' bits
    const ROAD_TABLE = [ROADS, ROADS2, ROADS, ROADS3, ROADS2, ROADS2, ROADS4, ROADS8, ROADS, ROADS6, ROADS, ROADS7,
                        ROADS5, ROADS10, ROADS9, INTERSECTION];
    const DOWN = ROAD_NORTH | ROAD_SOUTH;
    const ACROSS = ROAD_EAST | ROAD_WEST;

    it("leaves a road by every way the road tool joined it by, and a straight one by both ends", () => {
        const wrong: string[] = [];
        ROAD_TABLE.forEach((road, joined) => {
            // A road joined by one way or none runs straight through the tile, across where it was joined by neither
            // north nor south
            const straight = (joined & DOWN) !== 0 ? DOWN : ACROSS;
            const ways = [0, 1, 2, 4, 8].includes(joined) ? straight : joined;
            if (roadWays(road) !== ways) {
                wrong.push(`${road} joined by ${joined} leaves by ${roadWays(road)}`);
            }
        });

        expect(wrong).toEqual([]);
    });

    it.each([
        ["a horizontal bridge", HBRIDGE, ACROSS],
        ["a vertical bridge", VBRIDGE, DOWN],
        ["road across a power line", HROADPOWER, ACROSS],
        ["road down across a power line", VROADPOWER, DOWN],
        ["road down across rail", HRAILROAD, DOWN],
        ["road across over rail", VRAILROAD, ACROSS],
        ["a horizontal drawbridge, open", BRWH, ACROSS],
        ["a vertical drawbridge, open", BRWV, DOWN],
        ...[HBRDG0, HBRDG0 + 1, HBRDG0 + 2, HBRDG3].map((id) => [`horizontal drawbridge ${id}`, id, ACROSS]),
        ...[VBRDG0, VBRDG0 + 1, VBRDG0 + 2, VBRDG3].map((id) => [`vertical drawbridge ${id}`, id, DOWN]),
        ["heavy traffic on a bend, as the bend", HTRFBASE + (ROADS3 - ROADBASE), ROAD_NORTH | ROAD_EAST],
        ["rail", LHRAIL, 0],
        ["bare land", DIRT, 0],
    ] as [string, number, number][])("leaves %s by its ways", (_, id, ways) => {
        expect(roadWays(id)).toBe(ways);
    });
});
