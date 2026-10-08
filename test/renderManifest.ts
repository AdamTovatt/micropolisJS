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

import { CAR_COLOURS } from "../src/cars";
import { CAR_DIRECTIONS } from "../src/routeTiles";
import {
    FALLBACK_SPRITES, FALLBACK_TILES, RenderArt, RenderManifest, SPRITE_SHEET, WHITE, carKey, checkAtlasSizes,
    checkRectsInAtlases,
    fallbackManifest, fallbackSpriteRect, parseRenderManifest, spriteKey,
} from "../src/renderManifest";
import { repositoryPath } from "./helpers/repository";
import { tileImageOrigin } from "../src/tileSet";
import { TILE_COUNT } from "../src/tileValues";


// A PNG's size, from its header: the width and height start 16 bytes in
function pngSize(path: string): {width: number, height: number} {
    const header = readFileSync(repositoryPath(path)).subarray(0, 24);
    return {width: header.readUInt32BE(16), height: header.readUInt32BE(20)};
}

// The fallback sheets' sizes, as the images are
const SHEET_SIZES = new Map([[FALLBACK_TILES, pngSize("images/tiles.png")],
                             [FALLBACK_SPRITES, pngSize("images/sprites.png")]]);

// A manifest file's JSON, with one atlas, the tiles and sprites given and no cars
function manifestJson(tiles: object = {}, sprites: object = {}): Record<string, unknown> {
    return {version: 1, atlases: {zones: "zones.png"}, tiles, sprites, cars: {}};
}

const rect = (x: number, y: number, size = 64) => ({atlas: "zones", x, y, width: size, height: size});

describe("the render manifest", () => {

    describe("the fallback manifest", () => {

        const fallback = fallbackManifest();

        it("draws every tile id from its 16 px tile on images/tiles.png, as ground with no shadow or objects", () => {
            const wrong: number[] = [];
            for (let id = 0; id < TILE_COUNT; id++) {
                const origin = tileImageOrigin(id);
                const art = fallback.tiles.get(id);
                const expected = {
                    ground: {atlas: FALLBACK_TILES, x: origin.x, y: origin.y, width: 16, height: 16},
                    shadow: null,
                    objects: null,
                };
                if (JSON.stringify(art) !== JSON.stringify(expected)) {
                    wrong.push(id);
                }
            }

            expect(wrong).toEqual([]);
            expect(fallback.tiles.size).toBe(TILE_COUNT);
        });

        it("draws every frame of every sprite type from its cell of images/sprites.png", () => {
            SPRITE_SHEET.forEach(({frames, width}, row) => {
                const type = row + 1;
                for (let frame = 1; frame <= frames; frame++) {
                    expect(fallback.sprites.get(spriteKey(type, frame))).toEqual({
                        atlas: FALLBACK_SPRITES, x: (frame - 1) * 48, y: (type - 1) * 48, width, height: width,
                    });
                }
            });

            expect(fallback.sprites.size).toBe(SPRITE_SHEET.reduce((sum, {frames}) => sum + frames, 0));
        });

        it("lies wholly on the sheets", () => {
            expect(() => checkRectsInAtlases(fallback, SHEET_SIZES)).not.toThrow();
        });

        it("has no sprite cell for a type or frame the sheet lacks", () => {
            expect([fallbackSpriteRect(0, 1), fallbackSpriteRect(8, 1), fallbackSpriteRect(6, 0),
                    fallbackSpriteRect(6, 4), fallbackSpriteRect(6, 1.5)]).toEqual([null, null, null, null, null]);
        });
    });

    describe("reading a manifest file", () => {

        it("reads each layer of a tile, and a sprite frame", () => {
            const shadow = {...rect(0, 64, 192), reach: {left: 1, top: 0, right: 0, bottom: 1}};
            const manifest = parseRenderManifest(manifestJson(
                {"249": {ground: rect(0, 0), objects: rect(64, 0), shadow}, "250": {ground: rect(128, 0)}},
                {"5": {"16": rect(0, 256, 192)}},
            ));

            expect(manifest.atlases).toEqual(new Map([["zones", "zones.png"]]));
            expect(manifest.tiles.get(249)).toEqual({ground: rect(0, 0), objects: rect(64, 0), shadow});
            expect(manifest.tiles.get(250)).toEqual({ground: rect(128, 0), objects: null, shadow: null});
            expect(manifest.sprites).toEqual(new Map([[spriteKey(5, 16), rect(0, 256, 192)]]));
        });

        it("reads a manifest of no art", () => {
            const manifest = parseRenderManifest({version: 1, atlases: {}, tiles: {}, sprites: {}, cars: {}});

            expect([manifest.atlases.size, manifest.tiles.size, manifest.sprites.size, manifest.cars.size])
                .toEqual([0, 0, 0, 0]);
        });

        it("reads a car of each colour and way it has, by colour and way", () => {
            const manifest = parseRenderManifest({...manifestJson(), cars: {red: {north: rect(0, 0), west: rect(64, 0)},
                                                                            orange: {south: rect(128, 0)}}});

            expect([...manifest.cars]).toEqual([[carKey("red", "north"), rect(0, 0)], [carKey("red", "west"), rect(64, 0)],
                                                [carKey("orange", "south"), rect(128, 0)]]);
        });

        it.each<[string, Record<string, unknown>, string]>([
            ["another version", {...manifestJson(), version: 2}, "version is not 1"],
            ["a key it doesn't know", {...manifestJson(), extra: true}, "the manifest has unknown keys: extra"],
            ["no cars", {version: 1, atlases: {}, tiles: {}, sprites: {}}, "the manifest lacks cars"],
            ["a fallback sheet's name for an atlas", {...manifestJson(), atlases: {[FALLBACK_TILES]: "x.png"}},
             `atlases.${FALLBACK_TILES} takes a name starting fallback:, which the client keeps for its own`],
            ["the white pixel's name for an atlas", {...manifestJson(), atlases: {[WHITE]: "x.png"}},
             `atlases.${WHITE} takes a name starting fallback:`],
            ["any name the client keeps for an atlas", {...manifestJson(), atlases: {"fallback:roads": "x.png"}},
             "atlases.fallback:roads takes a name starting fallback:"],
            ["a tile with no ground", manifestJson({"1": {objects: rect(0, 0)}}), "tiles.1 lacks ground"],
            ["a tile id past the last", manifestJson({[TILE_COUNT]: {ground: rect(0, 0)}}),
             `tiles.${TILE_COUNT} is not a whole number from 0 to ${TILE_COUNT - 1}`],
            ["a tile id that isn't a number", manifestJson({"01": {ground: rect(0, 0)}}), "tiles.01 is not a whole"],
            ["an atlas it doesn't declare", manifestJson({"1": {ground: {...rect(0, 0), atlas: "roads"}}}),
             "tiles.1.ground.atlas names no atlas"],
            ["a fallback sheet as an atlas", manifestJson({"1": {ground: {...rect(0, 0), atlas: FALLBACK_TILES}}}),
             "tiles.1.ground.atlas names no atlas"],
            ["a fractional position", manifestJson({"1": {ground: rect(0.5, 0)}}), "tiles.1.ground.x is not a whole"],
            ["an empty rectangle", manifestJson({"1": {ground: rect(0, 0, 0)}}),
             "tiles.1.ground.width is not a whole number of at least 1"],
            ["a shadow with no reach", manifestJson({"1": {ground: rect(0, 0), shadow: rect(0, 64)}}),
             "tiles.1.shadow lacks reach"],
            ["a shadow reaching a negative way",
             manifestJson({"1": {ground: rect(0, 0), shadow: {...rect(0, 64), reach: {left: -1, top: 0, right: 0,
                                                                                       bottom: 0}}}}),
             "tiles.1.shadow.reach.left is not a whole number of at least 0"],
            ["a sprite type no sprite has", manifestJson({}, {"8": {"1": rect(0, 0)}}),
             "sprites.8 is not a whole number from 1 to 7"],
            ["a frame past a sprite's last", manifestJson({}, {"6": {"4": rect(0, 0)}}),
             "sprites.6.4 is not a whole number from 1 to 3"],
            ["a car colour the client has none of", {...manifestJson(), cars: {purple: {north: rect(0, 0)}}},
             "cars has unknown keys: purple"],
            ["a way no car faces", {...manifestJson(), cars: {red: {up: rect(0, 0)}}}, "cars.red has unknown keys: up"],
            ["a car's atlas it doesn't declare", {...manifestJson(), cars: {red: {north: {...rect(0, 0), atlas: "x"}}}},
             "cars.red.north.atlas names no atlas"],
        ])("refuses %s, naming where", (_, json, message) => {
            expect(() => parseRenderManifest(json)).toThrow(`Render manifest: ${message}`);
        });

        it("refuses a rectangle that runs past its atlas, naming it", () => {
            const manifest = parseRenderManifest(manifestJson({"3": {ground: rect(0, 0), objects: rect(64, 0)}}));

            expect(() => checkRectsInAtlases(manifest, new Map([["zones", {width: 100, height: 64}]])))
                .toThrow("rectangles run past their atlas: tile 3 objects (zones)");
            expect(() => checkRectsInAtlases(manifest, new Map([["zones", {width: 128, height: 64}]]))).not.toThrow();
        });

        // The art build names the colours as the client does (CAR_COLOURS in art/tools/designs.py)
        it("has, as the art build writes it, a car of every colour facing every way", () => {
            const manifest = parseRenderManifest(JSON.parse(readFileSync(repositoryPath("images/render/manifest.json"),
                                                                         "utf8")));
            const missing = CAR_COLOURS.flatMap(({name}) => CAR_DIRECTIONS.map((way) => carKey(name, way)))
                .filter((key) => !manifest.cars.has(key));

            expect([missing, manifest.cars.size]).toEqual([[], CAR_COLOURS.length * CAR_DIRECTIONS.length]);
        });

        it("refuses a car that runs past its atlas, naming it", () => {
            const manifest = parseRenderManifest({...manifestJson(), cars: {blue: {east: rect(64, 0)}}});

            expect(() => checkRectsInAtlases(manifest, new Map([["zones", {width: 100, height: 64}]])))
                .toThrow("rectangles run past their atlas: car blue/east (zones)");
        });

        it("refuses each atlas wider or higher than the browser's largest texture, naming it", () => {
            const sizes = new Map([["wide", {width: 4097, height: 64}], ["high", {width: 64, height: 4097}],
                                   ["fits", {width: 4096, height: 4096}]]);

            expect(() => checkAtlasSizes(sizes, 4096))
                .toThrow("Atlases are past this browser's 4096 pixels a side: wide is 4097 by 64, high is 64 by 4097");
            expect(() => checkAtlasSizes(sizes, 4097)).not.toThrow();
        });
    });

    describe("the art the map draws with", () => {

        const shadow = (reach: number[]) => ({
            ...rect(0, 64, 64), reach: {left: reach[0], top: reach[1], right: reach[2], bottom: reach[3]},
        });
        const rendered: RenderManifest = parseRenderManifest({...manifestJson(
            {"249": {ground: rect(0, 0), shadow: shadow([2, 1, 0, 3])}, "250": {ground: rect(64, 0)}},
            {"1": {"2": rect(0, 128, 32)}},
        ), cars: {blue: {east: rect(0, 192)}}});
        const art = new RenderArt(rendered);

        it("draws a tile id the rendered art has from it", () => {
            expect(art.tile(250)).toEqual(rendered.tiles.get(250));
        });

        it("draws a tile id the rendered art leaves out from its fallback", () => {
            expect(art.tile(251)).toEqual(fallbackManifest().tiles.get(251));
        });

        it("draws a sprite frame from the rendered art where it has one, and from the fallback where not", () => {
            expect(art.sprite(1, 2)).toEqual(rect(0, 128, 32));
            expect(art.sprite(1, 3)).toEqual(fallbackManifest().sprites.get(spriteKey(1, 3)));
            expect(art.sprite(1, 6)).toBeNull();
        });

        // Blue is the second colour
        it("draws a car from the rendered art where it has one, and none where not", () => {
            expect([art.car(1, "east"), art.car(1, "west"), art.car(0, "east")]).toEqual([rect(0, 192), null, null]);
        });

        it("knows the farthest any shadow reaches, on any side", () => {
            expect(art.shadowReach).toBe(3);
            expect(new RenderArt(parseRenderManifest(manifestJson())).shadowReach).toBe(0);
        });
    });
});
