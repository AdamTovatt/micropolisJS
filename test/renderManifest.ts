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
import type { CanopyArt } from "../src/renderManifest";
import { SURFACE_REACH } from "../src/surfaces";
import { committedGrass, committedSurface, committedWalkway, plainCanopy, plainGrass, plainWalkers, plainWalkway,
    plainWater } from "./helpers/grassArt";
import type { CanopyJson, GrassJson, WalkwayJson, WaterJson } from "./helpers/grassArt";
import { repositoryJson, repositoryPath } from "./helpers/repository";
import { tileImageOrigin } from "../src/tileSet";
import { LTRFBASE, TILE_COUNT } from "../src/tileValues";


// A PNG's size, from its header: the width and height start 16 bytes in
function pngSize(path: string): {width: number, height: number} {
    const header = readFileSync(repositoryPath(path)).subarray(0, 24);
    return {width: header.readUInt32BE(16), height: header.readUInt32BE(20)};
}

// The fallback sheets' sizes, as the images are
const SHEET_SIZES = new Map([[FALLBACK_TILES, pngSize("images/tiles.png")],
                             [FALLBACK_SPRITES, pngSize("images/sprites.png")]]);

const rect = (x: number, y: number, size = 64) => ({atlas: "zones", x, y, width: size, height: size});

// A manifest file's JSON, with one atlas, the tiles and sprites given, no cars and the plainest grass and canopy
function manifestJson(tiles: object = {}, sprites: object = {}): Record<string, unknown> {
    return {version: 1, atlases: {zones: "zones.png"}, tiles, sprites, cars: {}, grass: plainGrass(rect(0, 0)),
            canopy: plainCanopy(rect(0, 0)), water: plainWater(rect(0, 0)), walkway: plainWalkway(rect(0, 0)),
            walkers: plainWalkers(rect(0, 0, 32))};
}

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
                    grass: null,
                    water: false,
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
            // Beside the world grass and the canopy every manifest has, here on the tile sheet's first cell
            const onSheet = {atlas: FALLBACK_TILES, x: 0, y: 0, width: 16, height: 16};
            const plain = parseRenderManifest(manifestJson());
            const grass = {...plain.grass, atlas: FALLBACK_TILES, lush: {mean: [0, 0, 0] as const, tiles: [onSheet]},
                           straw: {mean: [0, 0, 0] as const, tiles: [onSheet]}};
            const canopy = {...plain.canopy, tiles: [onSheet]};
            const water = {...plain.water, tiles: [onSheet]};

            const walkers = {dabs: [onSheet]};
            const walkway = {...plain.walkway, deck: {...onSheet, tiles: 3}, stairs: onSheet};

            expect(() => checkRectsInAtlases({...fallback, walkers, grass, canopy, water, walkway}, SHEET_SIZES))
                .not.toThrow();
        });

        it("has no sprite cell for a type or frame the sheet lacks", () => {
            expect([fallbackSpriteRect(0, 1), fallbackSpriteRect(8, 1), fallbackSpriteRect(6, 0),
                    fallbackSpriteRect(6, 4), fallbackSpriteRect(6, 1.5)]).toEqual([null, null, null, null, null]);
        });
    });

    describe("reading a manifest file", () => {

        it("reads a tile the map draws as water", () => {
            const art = new RenderArt(parseRenderManifest(manifestJson({"64": {ground: rect(0, 0), water: true}})));

            expect([art.tile(64).water, art.isWater(64), art.isWater(0)]).toEqual([true, true, false]);
        });

        it("draws a traffic tile as water where its plain road is", () => {
            // The plain road of the bridge's first traffic tile is the bridge, 64
            const art = new RenderArt(parseRenderManifest(manifestJson({"64": {ground: rect(0, 0), water: true}})));

            expect(art.isWater(LTRFBASE)).toBe(true);
        });

        it("reads each layer of a tile, and a sprite frame", () => {
            const shadow = {...rect(0, 64, 192), reach: {left: 1, top: 0, right: 0, bottom: 1}};
            const manifest = parseRenderManifest(manifestJson(
                {"249": {ground: rect(0, 0), objects: rect(64, 0), shadow}, "250": {ground: rect(128, 0)}},
                {"5": {"16": rect(0, 256, 192)}},
            ));

            expect(manifest.atlases).toEqual(new Map([["zones", "zones.png"]]));
            expect(manifest.tiles.get(249)).toEqual({ground: rect(0, 0), objects: rect(64, 0), shadow, grass: null,
                                                     water: false});
            expect(manifest.tiles.get(250)).toEqual({ground: rect(128, 0), objects: null, shadow: null, grass: null,
                                                     water: false});
            expect(manifest.sprites).toEqual(new Map([[spriteKey(5, 16), rect(0, 256, 192)]]));
        });

        it("reads a manifest of no art but the world grass every manifest has", () => {
            const manifest = parseRenderManifest(manifestJson());

            expect([manifest.atlases.size, manifest.tiles.size, manifest.sprites.size, manifest.cars.size])
                .toEqual([1, 0, 0, 0]);
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
            ["a ground that lets grass through by another word", manifestJson({"0": {ground: rect(0, 0), grass: "some"}}),
             "tiles.0.grass is neither all nor part"],
            ["a tile marked as water by anything but true", manifestJson({"2": {ground: rect(0, 0), water: false}}),
             "tiles.2.water is not true"],
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
            const manifest = parseRenderManifest(repositoryJson("images/render/manifest.json"));
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

        describe("the world grass", () => {

            // The committed manifest's grass and canopy sections, each set's tile i and the canopy's moved to (64 i, 0)
            // of the test's atlas, in a manifest that also has a second atlas; each set colours ** 4 tiles
            const grassJson = (): GrassJson => committedGrass((_, i) => rect(64 * i, 0));
            const canopyJson = (): CanopyJson => committedSurface("canopy", (i) => rect(64 * i, 0));
            const waterJson = (): WaterJson => committedSurface("water", (i) => rect(64 * i, 0));
            const tiles = grassJson().colours ** 4;
            const withGrass = (grass: GrassJson, canopy = canopyJson(), water = waterJson()) => ({
                ...manifestJson(), atlases: {zones: "zones.png", other: "o.png"}, grass, canopy, water,
            });

            it("reads both sets and the constants", () => {
                const grass = parseRenderManifest(withGrass(grassJson())).grass;

                expect(grass.atlas).toBe("zones");
                expect(grass.texels).toBe(64);
                expect([grass.lush.tiles.length, grass.straw.tiles.length]).toEqual([tiles, tiles]);
                expect(grass.straw.tiles[2]).toEqual(rect(128, 0));
                expect(grass.straw.mean).toEqual(grassJson().sets.straw.mean);
                expect(grass.constants.mask.gradients).toHaveLength(16);
            });

            it("reads the plainest grass, of one colour and so one tile a set", () => {
                const grass = parseRenderManifest(manifestJson()).grass;

                expect([grass.constants.colours, grass.lush.tiles, grass.straw.tiles]).toEqual([1, [rect(0, 0)],
                                                                                                [rect(0, 0)]]);
            });

            it("refuses a manifest with none", () => {
                const json = manifestJson();
                delete json.grass;

                expect(() => parseRenderManifest(json)).toThrow("Render manifest: the manifest lacks grass");
            });

            it.each<[string, (json: GrassJson) => void, string]>([
                ["a set short of a tile", (json) => json.sets.lush.tiles.pop(),
                 `grass.sets.lush.tiles is not ${tiles} tiles`],
                ["no colours", (json) => json.colours = 0, "grass.colours is not a whole number of at least 1"],
                ["sets in two atlases", (json) => {
                    json.sets.straw.tiles[0] = {...rect(0, 0), atlas: "other"};
                }, "grass.sets are not all in one atlas"],
                ["a tile of another size", (json) => {
                    json.sets.lush.tiles[3] = {...rect(0, 0), width: 32};
                }, "grass.sets are not all squares of one size"],
                ["a tile not square", (json) => {
                    json.sets.straw.tiles[5] = {...rect(0, 0), height: 63};
                }, "grass.sets are not all squares of one size"],
                ["a missing set", (json) => delete (json.sets as Partial<GrassJson["sets"]>).straw,
                 "grass.sets lacks straw"],
                ["a key the format doesn't name", (json) => json.noise = 1, "grass has unknown keys: noise"],
                ["fewer than 16 gradients", (json) => json.mask.gradients.pop(), "grass.mask.gradients is not 16"],
                ["a turn of one number", (json) => json.mask.octaves[0].turn = [1],
                 "grass.mask.octaves[0].turn is not a list of 2 numbers"],
                ["a seed past 32 bits", (json) => json.corners.seed = 2 ** 32, "grass.corners.seed is past"],
                ["a cell of no size", (json) => json.tint.octaves[0].cell = 0, "grass.tint.octaves[0].cell is not more"],
            ])("refuses %s, naming where", (_, change, message) => {
                const json = grassJson();
                change(json);
                expect(() => parseRenderManifest(withGrass(json))).toThrow(`Render manifest: ${message}`);
            });

            it("refuses a grass, canopy or water tile that runs past its atlas, naming it", () => {
                const manifest = parseRenderManifest(withGrass(grassJson()));

                // The last tile of each set, of the canopy and of the water lies one tile past the atlas
                expect(() => checkRectsInAtlases(manifest, new Map([["zones", {width: 64 * (tiles - 1), height: 64}]])))
                    .toThrow(`lush grass ${tiles - 1} (zones), straw grass ${tiles - 1} (zones), ` +
                             `canopy ${tiles - 1} (zones), water ${tiles - 1} (zones)`);
            });

            it("reads the water: its seed, cut, feather, edge, sand and tiles, as many as a grass set's", () => {
                const water = parseRenderManifest(withGrass(grassJson())).water;

                expect([water.corners.seed, water.cut, water.feather]).toEqual([waterJson().corners.seed,
                                                                                waterJson().cut, waterJson().feather]);
                expect([water.edge, water.sand]).toEqual([waterJson().edge, waterJson().sand]);
                expect(water.tiles).toHaveLength(tiles);
                expect(water.tiles[2]).toEqual(rect(128, 0));
            });

            it("refuses a manifest with no water", () => {
                const json = manifestJson();
                delete json.water;

                expect(() => parseRenderManifest(json)).toThrow("Render manifest: the manifest lacks water");
            });

            it.each<[string, (json: WaterJson) => void, string]>([
                ["water short of a tile", (json) => json.tiles.pop(),
                 `water.tiles is not ${tiles} tiles, as many as a grass set's`],
                ["a water tile in another atlas", (json) => json.tiles[4] = {...rect(0, 0), atlas: "other"},
                 "water.tiles are not all in the grass's atlas"],
                ["no feather", (json) => json.feather = 0, "water.feather is not more than 0"],
                ["no sand", (json) => delete (json as Partial<WaterJson>).sand, "water lacks sand"],
                ["no band of sand", (json) => json.sand.band = 0, "water.sand.band is not more than 0"],
                ["a sand of two colours", (json) => json.sand.mean = [1, 2], "water.sand.mean is not a list of 3"],
                ["sand keeping more than the grass's light and dark", (json) => json.sand.contrast = 2,
                 "water.sand.contrast is not from 0 to 1"],
                ["an edge octave without its turn", (json) => delete json.edge.octaves[0].turn,
                 "water.edge.octaves[0] lacks turn"],
            ])("refuses %s, naming where", (_, change, message) => {
                const json = waterJson();
                change(json);
                expect(() => parseRenderManifest(withGrass(grassJson(), canopyJson(), json)))
                    .toThrow(`Render manifest: ${message}`);
            });

            it.each([0, 1])("reads sand keeping a share of %p of the grass's light and dark, at the bound", (contrast) => {
                const json = waterJson();
                json.sand.contrast = contrast;

                expect(parseRenderManifest(withGrass(grassJson(), canopyJson(), json)).water.sand.contrast)
                    .toBe(contrast);
            });

            it.each<[string, (json: CanopyJson) => void, (canopy: CanopyArt) => number, number]>([
                ["a shadow falling straight under the canopy", (json) => json.shadow.offset = 0,
                 (canopy) => canopy.shadow.offset, 0],
                ["a shadow as dark as black", (json) => json.shadow.darkness = 1, (canopy) => canopy.shadow.darkness, 1],
                ["a shadow of no darkness", (json) => json.shadow.darkness = 0, (canopy) => canopy.shadow.darkness, 0],
            ])("reads %s, at the bound", (_, change, read, value) => {
                const json = canopyJson();
                change(json);

                expect(read(parseRenderManifest(withGrass(grassJson(), json)).canopy)).toBe(value);
            });

            it("reads the canopy: its seed, cut, feather, edge and tiles, as many as a grass set's", () => {
                const canopy = parseRenderManifest(withGrass(grassJson())).canopy;

                expect([canopy.corners.seed, canopy.cut, canopy.feather]).toEqual([canopyJson().corners.seed,
                                                                                   canopyJson().cut, canopyJson().feather]);
                expect(canopy.edge).toEqual(canopyJson().edge);
                expect(canopy.shadow).toEqual(canopyJson().shadow);
                expect(canopy.tiles).toHaveLength(tiles);
                expect(canopy.tiles[2]).toEqual(rect(128, 0));
            });

            it("refuses a manifest with no canopy", () => {
                const json = manifestJson();
                delete json.canopy;

                expect(() => parseRenderManifest(json)).toThrow("Render manifest: the manifest lacks canopy");
            });

            it.each<[string, (json: CanopyJson) => void, string]>([
                ["a canopy short of a tile", (json) => json.tiles.pop(),
                 `canopy.tiles is not ${tiles} tiles, as many as a grass set's`],
                ["a canopy tile in another atlas", (json) => json.tiles[4] = {...rect(0, 0), atlas: "other"},
                 "canopy.tiles are not all in the grass's atlas"],
                ["a canopy tile of another size", (json) => json.tiles[1] = {...rect(0, 0), width: 32, height: 32},
                 "canopy.tiles are not all squares of the grass tiles' size"],
                ["no feather", (json) => json.feather = 0, "canopy.feather is not more than 0"],
                ["a cut that is no number", (json) => json.cut = "half", "canopy.cut is not a number"],
                ["no wobble to its edge", (json) => delete (json as Partial<CanopyJson>).edge, "canopy lacks edge"],
                ["an edge octave without its turn", (json) => delete json.edge.octaves[0].turn,
                 "canopy.edge.octaves[0] lacks turn"],
                ["no shadow", (json) => delete (json as Partial<CanopyJson>).shadow, "canopy lacks shadow"],
                ["a shadow falling a whole tile, past the woods a tile's shadow is cast from",
                 (json) => json.shadow.offset = 1, "canopy.shadow.offset is not from 0 to below 1"],
                ["a shadow falling toward the sun", (json) => json.shadow.offset = -0.1,
                 "canopy.shadow.offset is not from 0 to below 1"],
                ["a shadow darker than black", (json) => json.shadow.darkness = 1.5,
                 "canopy.shadow.darkness is not from 0 to 1"],
                ["a shadow with no feather", (json) => json.shadow.feather = 0, "canopy.shadow.feather is not more than 0"],
                ["a key the format doesn't name", (json) => json.shade = 1, "canopy has unknown keys: shade"],
            ])("refuses %s, naming where", (_, change, message) => {
                const json = canopyJson();
                change(json);
                expect(() => parseRenderManifest(withGrass(grassJson(), json))).toThrow(`Render manifest: ${message}`);
            });
        });

        describe("the walkers", () => {

            it("reads the committed manifest's dabs, each a rectangle", () => {
                const committed = repositoryJson<{atlases: object, walkers: {dabs: object[]}}>(
                    "images/render/manifest.json");
                const plain = manifestJson();
                const json = {...plain, atlases: {...plain.atlases as object, ...committed.atlases},
                              walkers: committed.walkers};

                expect(parseRenderManifest(json).walkers.dabs).toEqual(committed.walkers.dabs);
                expect(committed.walkers.dabs.length).toBeGreaterThan(0);
            });

            it("draws a walker as the dab its number picks, of those it has, round and round", () => {
                const json = {...manifestJson(), walkers: {dabs: [rect(0, 0, 32), rect(32, 0, 32)]}};
                const art = new RenderArt(parseRenderManifest(json));

                expect([art.walkerDab(0), art.walkerDab(1), art.walkerDab(7)])
                    .toEqual([rect(0, 0, 32), rect(32, 0, 32), rect(32, 0, 32)]);
            });

            it.each<[string, unknown, string]>([
                ["none", undefined, "the manifest lacks walkers"],
                ["no dab", {dabs: []}, "walkers.dabs is not a list of at least one"],
                ["a dab in an atlas the manifest doesn't declare", {dabs: [{...rect(0, 0), atlas: "people"}]},
                 "walkers.dabs[0]"],
                ["a key the format doesn't name", {dabs: [rect(0, 0)], people: 1}, "walkers has unknown keys: people"],
            ])("refuses %s, naming where", (_, walkers, message) => {
                const json = manifestJson();
                if (walkers === undefined) {
                    delete json.walkers;
                } else {
                    json.walkers = walkers;
                }

                expect(() => parseRenderManifest(json)).toThrow(`Render manifest: ${message}`);
            });
        });

        describe("the walkways", () => {

            const withWalkway = (walkway: WalkwayJson) => ({...manifestJson(), walkway});

            // The committed manifest's, its deck and stairs moved into the test manifest's one atlas, its grass's
            const committed = (): WalkwayJson => {
                const json = committedWalkway();
                return {...json, deck: {...(json.deck as object), atlas: "zones"},
                        stairs: {...(json.stairs as object), atlas: "zones"}};
            };

            it("reads the committed manifest's", () => {
                const json = committed();
                const walkway = parseRenderManifest(withWalkway(json)).walkway;

                expect(walkway).toEqual({cut: json.cut, feather: json.feather, edge: json.edge, gravel: json.gravel,
                                         paving: json.paving, crossing: json.crossing, deck: json.deck,
                                         footbridge: json.footbridge, stairs: json.stairs});
            });

            it("refuses a manifest with none", () => {
                const json = manifestJson();
                delete json.walkway;

                expect(() => parseRenderManifest(json)).toThrow("Render manifest: the manifest lacks walkway");
            });

            it.each<[string, (json: WalkwayJson) => void, string]>([
                ["no feather", (json) => json.feather = 0, "walkway.feather is not more than 0"],
                ["a feather reaching past half way between ninths", (json) => [json.cut, json.feather] = [0.6, 0.25],
                 "walkway has a cut less half its feather under 0.5, so its paths spill out of their ninths"],
                ["a cut past the surface", (json) => json.cut = 1.2, "walkway.cut is not from 0 to 1"],
                ["an edge eaten past the surface", (json) => json.edge = -0.1, "walkway.edge is not from 0 to 1"],
                ["a colour of two numbers", (json) => json.paving.mean = [1, 2],
                 "walkway.paving.mean is not a list of 3 numbers"],
                ["more than all of the straw's light and dark", (json) => json.gravel.contrast = 2,
                 "walkway.gravel.contrast is not from 0 to 1"],
                ["a crossing of no stripes", (json) => json.crossing.stripes = 0,
                 "walkway.crossing.stripes is not more than 0"],
                ["no paving", (json) => delete (json as Partial<WalkwayJson>).paving, "walkway lacks paving"],
                ["a key the format doesn't name", (json) => json.kerb = 1, "walkway has unknown keys: kerb"],
                ["a deck outside the grass's atlas", (json) => json.deck = {...(json.deck as object), atlas: "other"},
                 "walkway.deck.atlas names no atlas of the manifest's"],
                ["a deck spanning no tiles", (json) => json.deck = {...(json.deck as object), tiles: 0},
                 "walkway.deck.tiles is not more than 0"],
                ["rails past black", (json) => (json.footbridge as {rail: object}).rail = {width: 0.1, darkness: 2},
                 "walkway.footbridge.rail.darkness is not from 0 to 1"],
                ["rails wider than half the deck",
                 (json) => (json.footbridge as {rail: object}).rail = {width: 0.5, darkness: 0.5},
                 "walkway.footbridge has rails wider than half its deck"],
                ["a deck's shadow falling a whole ninth",
                 (json) => (json.footbridge as {shadow: {offset: number}}).shadow.offset = 1,
                 "walkway.footbridge.shadow.offset is not from 0 to below 1"],
                ["no stairs", (json) => delete json.stairs, "walkway lacks stairs"],
            ])("refuses %s, naming where", (_, change, message) => {
                const json = committed();
                change(json);
                expect(() => parseRenderManifest(withWalkway(json))).toThrow(`Render manifest: ${message}`);
            });
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

        it("knows how far a tile's look reaches: as far as the farthest shadow, on any side, and the canopy's tile", () => {
            expect(art.reach).toBe(3);
            expect(new RenderArt(parseRenderManifest(manifestJson())).reach).toBe(SURFACE_REACH);
        });
    });
});
