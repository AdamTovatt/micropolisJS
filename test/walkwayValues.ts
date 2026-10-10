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

import { WALKWAY_KINDS } from "../src/protocol";
import { DIRT, HRAILROAD, LHRAIL, ROADS, ROADS2 } from "../src/tileValues";
import { carriageway, crossings, kindAt, kindNinths, kindNumber, locateNinth, track } from "../src/walkwayValues";
import { RULES } from "./helpers/ruleConstants";
import { walkwayOf } from "./helpers/walkways";

const path = (...ninths: number[]) => walkwayOf(ninths);

// The ninths of a tile, a bit 1 << n for each
function ninthsOf(...ninths: number[]): number {
    return ninths.reduce((all, n) => all | (1 << n), 0);
}

describe("a walkway value", () => {

    it("numbers each kind from 1 in the order the kinds are listed, and holds it on each ninth", () => {
        const walkway = walkwayOf([0], "footbridge") | walkwayOf([4], "underpass") | walkwayOf([8]);
        expect(WALKWAY_KINDS.map((kind) => kindNumber(kind))).toEqual([1, 2, 3]);
        expect([kindAt(walkway, 0), kindAt(walkway, 4), kindAt(walkway, 8), kindAt(walkway, 1)])
            .toEqual([kindNumber("footbridge"), kindNumber("underpass"), kindNumber("path"), 0]);
    });

    it("holds each kind of walkway on the ninths that hold that kind", () => {
        const walkway = walkwayOf([0, 1], "footbridge") | walkwayOf([4], "underpass") | walkwayOf([8]);
        expect([kindNinths(walkway, "path"), kindNinths(walkway, "footbridge"), kindNinths(walkway, "underpass")])
            .toEqual([ninthsOf(8), ninthsOf(0, 1), ninthsOf(4)]);
    });
});

describe("a ninth of the map's grid of ninths", () => {

    it.each([[0, 0, {x: 0, y: 0}, 0], [5, 4, {x: 1, y: 1}, 5], [7, 2, {x: 2, y: 0}, 7], [-1, 3, {x: -1, y: 1}, 2],
             [3, -1, {x: 1, y: -1}, 6]])("(%i, %i) lies in tile %o, its ninth %i", (nx, ny, tile, n) => {
        expect(locateNinth(nx, ny)).toEqual({tile, n});
    });
});

describe("a road's carriageway and a rail's track", () => {

    // Every tile value the map holds, the flags' bits aside
    const ids = Array.from({length: 1024}, (_, id) => id);

    it("is the rules' carriageway of every tile, the middle and the sides its road leaves by", () => {
        expect(ids.map((id) => carriageway(id))).toEqual(ids.map((id) => RULES.carriageways[String(id)] ?? 0));
        expect([carriageway(ROADS), carriageway(HRAILROAD), carriageway(LHRAIL)])
            .toEqual([ninthsOf(3, 4, 5), ninthsOf(1, 4, 7), 0]);
    });

    it("is the rules' track of every tile, the middle and the sides its rail leaves by", () => {
        expect(ids.map((id) => track(id))).toEqual(ids.map((id) => RULES.tracks[String(id)] ?? 0));
        expect([track(LHRAIL), track(ROADS)]).toEqual([ninthsOf(3, 4, 5), 0]);
    });

    it("holds a crossing where a path lies on it, and no sidewalk beside it", () => {
        expect([crossings(path(1, 4, 7), ROADS), crossings(path(0, 1, 2), ROADS), crossings(path(3, 4, 5), ROADS2),
                crossings(path(1, 4, 7), DIRT)])
            .toEqual([ninthsOf(4), 0, ninthsOf(4), 0]);
    });

    it("holds no crossing where a footbridge or an underpass lies on it, which stops no car", () => {
        expect([crossings(walkwayOf([1, 4, 7], "footbridge"), ROADS), crossings(walkwayOf([1, 4, 7], "underpass"), ROADS)])
            .toEqual([0, 0]);
    });
});
