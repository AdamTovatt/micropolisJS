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

import { parseArguments, UsageError, wholeNumberOption } from "../cli/args";
import { DEFAULT_SERVER, resolveTarget } from "../cli/cityConnection";
import { mapText, overlayText, tileCharacter } from "../cli/mapText";
import { linePath, parsePoint } from "../cli/toolPath";
import type { OverlayAnswer } from "../src/protocol";
import { BULLBIT, POWERBIT, ZONEBIT } from "../src/tileFlags";
import { CHANNEL, DIRT, FREEZ, HROADPOWER, HTRFBASE, NUCLEAR, RAILBASE, RESBASE, WOODS } from "../src/tileValues";

// The command line's own parts: its arguments, the tiles and paths it reads from them, and the map it prints. Its
// connection is the page's own city client and source, which their suites test against the server.

const CITY = "0123456789abcdef0123456789abcdef";

describe("the command line's points and paths", () => {

    it("reads a tile written as x,y", () => {
        expect(parsePoint("12,40")).toEqual({x: 12, y: 40});
    });

    it.each(["12", "12,", "-1,4", "1.5,2", "a,b", "1,2,3"])("refuses %s", (text) => {
        expect(() => parsePoint(text)).toThrow("isn't a tile");
    });

    it("runs a line along the row, then the column, a tile a step", () => {
        expect(linePath([{x: 2, y: 5}, {x: 4, y: 3}])).toEqual([
            {x: 2, y: 5}, {x: 3, y: 5}, {x: 4, y: 5}, {x: 4, y: 4}, {x: 4, y: 3},
        ]);
    });

    it("joins its points without repeating the corners", () => {
        expect(linePath([{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}])).toEqual([{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}]);
    });

    it("is one tile for one point", () => {
        expect(linePath([{x: 7, y: 7}])).toEqual([{x: 7, y: 7}]);
    });
});

describe("the command line's map", () => {

    it.each([
        ["clear land", DIRT, "."],
        ["water", CHANNEL, "~"],
        ["trees", WOODS, "^"],
        ["a road with heavy traffic", HTRFBASE, "="],
        ["a road crossing a power line", HROADPOWER, "="],
        ["rail", RAILBASE, "#"],
        ["a residential zone's edge", RESBASE, "r"],
    ])("draws %s", (_, tile, character) => {
        expect(tileCharacter(tile | BULLBIT)).toBe(character);
    });

    it("draws a zone's centre in upper case, by its flag", () => {
        expect(tileCharacter(FREEZ | ZONEBIT | POWERBIT)).toBe("R");
        expect(tileCharacter(NUCLEAR | ZONEBIT)).toBe("N");
    });

    it("prints the area asked for, under rulers of its x coordinates and beside its y coordinates", () => {
        const tiles = new Array(12 * 3).fill(DIRT);
        tiles[1 * 12 + 10] = CHANNEL;

        expect(mapText({width: 12, height: 3, tiles}, {left: 9, top: 1, right: 11, bottom: 2})).toBe([
            "    01 ",
            "    901",
            "  1 .~.",
            "  2 ...",
        ].join("\n"));
    });

    it("keeps the area to the map", () => {
        const tiles = new Array(4).fill(DIRT);
        expect(mapText({width: 2, height: 2, tiles}, {left: -5, top: -5, right: 50, bottom: 50}).split("\n"))
            .toHaveLength(4);
        expect(() => mapText({width: 2, height: 2, tiles}, {left: 5, top: 0, right: 9, bottom: 1}))
            .toThrow("holds no tile");
    });

    it("prints an overlay a digit a block, from the layer's low end to its high", () => {
        const overlay: OverlayAnswer = {
            type: "overlay", layer: "landValue", blockSize: 2, width: 2, height: 1, low: 0, high: 250, values: [0, 250],
        };

        expect(overlayText(overlay, {left: 0, top: 0, right: 3, bottom: 1}, 4, 2).split("\n")[2]).toBe("  0 09");
    });
});

describe("the command line's arguments", () => {

    it("reads options given either way, and switches", () => {
        const args = parseArguments(["build", "--city", CITY, "road", "--tax=9", "1,2", "--no-auto-bulldoze"]);
        expect(args.words).toEqual(["build", "road", "1,2"]);
        expect(args.options).toEqual(new Map([["city", CITY], ["tax", "9"]]));
        expect(args.switches).toEqual(new Set(["no-auto-bulldoze"]));
    });

    it("refuses an option it doesn't have, and one without its value", () => {
        expect(() => parseArguments(["--colour", "red"])).toThrow(UsageError);
        expect(() => parseArguments(["budget", "--tax"])).toThrow("--tax needs a value");
    });

    it("reads a whole number option within its range", () => {
        expect(wholeNumberOption(parseArguments(["--fire", "45"]), "fire", 0, 100)).toBe(45);
        expect(wholeNumberOption(parseArguments([]), "fire", 0, 100)).toBeUndefined();
        expect(() => wholeNumberOption(parseArguments(["--tax", "21"]), "tax", 0, 20)).toThrow("from 0 to 20");
        expect(() => wholeNumberOption(parseArguments(["--tax", "9.5"]), "tax", 0, 20)).toThrow(UsageError);
    });
});

describe("the city and server a run is for", () => {

    const server = process.env.MICROPOLIS_SERVER;
    beforeEach(() => { delete process.env.MICROPOLIS_SERVER; });
    afterAll(() => {
        if (server !== undefined) {
            process.env.MICROPOLIS_SERVER = server;
        }
    });

    it("takes both from the city's link", () => {
        expect(resolveTarget(`https://example.org/game/?city=${CITY}`, undefined))
            .toEqual({origin: "https://example.org", city: CITY});
    });

    it("refuses a link that names no city, or another server than the one named", () => {
        expect(() => resolveTarget("https://example.org/", undefined)).toThrow("names no city");
        expect(() => resolveTarget(`https://example.org/?city=${CITY}`, "https://example.com"))
            .toThrow("not the server named");
    });

    it("takes a city's id with the server named, then MICROPOLIS_SERVER's, then the development server", () => {
        expect(resolveTarget(CITY, "http://localhost:9000/")).toEqual({origin: "http://localhost:9000", city: CITY});
        process.env.MICROPOLIS_SERVER = "http://localhost:8000";
        expect(resolveTarget(CITY, undefined).origin).toBe("http://localhost:8000");
        delete process.env.MICROPOLIS_SERVER;
        expect(resolveTarget(undefined, undefined)).toEqual({origin: DEFAULT_SERVER, city: null});
    });

    it("refuses a city that is no id", () => {
        expect(() => resolveTarget("ordo", undefined)).toThrow("isn't a city");
    });
});
