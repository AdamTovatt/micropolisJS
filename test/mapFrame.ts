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

import { CAR_COLOURS } from "../src/cars";
import type { PaintableCar } from "../src/cars";
import {
    CAR_BREADTH, CAR_LENGTH, FrameTiles, GROUND_GRASS_ONLY, GROUND_ONLY, GROUND_OVER_GRASS, GROUND_QUAD_FLOATS,
    GroundList, MapFrame, QUAD_FLOATS, QuadList, buildMapFrame, wholeMapTiles,
} from "../src/mapFrame";
import { isWoods, woodsAround } from "../src/canopy";
import type { Run, RunList } from "../src/mapFrame";
import type { Tint } from "../src/overlayRenderer";
import type { SpriteView } from "../src/protocol";
import type { Rect } from "../src/rect";
import { grassTile } from "../src/grass";
import { FALLBACK_SPRITES, FALLBACK_TILES, GRASS_FIELD, RenderArt, WHITE, parseRenderManifest } from "../src/renderManifest";
import { committedCanopy, committedGrass, plainCanopy, plainGrass } from "./helpers/grassArt";
import { tileImageOrigin } from "../src/tileSet";
import { ANIMBIT, BURNBIT, POWERBIT, ZONEBIT } from "../src/tileFlags";
import { LIGHTNINGBOLT, LTRFBASE, ROADBASE, ROADS, TILE_INVALID, WOODS_LOW } from "../src/tileValues";

// Tile 5 is rendered: ground, objects, and a shadow reaching a tile left and a tile down. Tile 6 has rendered ground
// only. Light traffic on a plain road has the art of its own the painted traffic had, its cars' shadow among it, and the
// plain road ground only. Every other id falls back.
const ZONE = 5;
const LAWN = 6;
const TRAFFIC = LTRFBASE + (ROADS - ROADBASE);
const artJson = {
    version: 1,
    atlases: {ground: "ground.png", objects: "objects.png", shadows: "shadows.png"},
    tiles: {
        [ZONE]: {
            ground: {atlas: "ground", x: 0, y: 0, width: 64, height: 64},
            objects: {atlas: "objects", x: 64, y: 0, width: 64, height: 64},
            shadow: {atlas: "shadows", x: 0, y: 0, width: 128, height: 128, reach: {left: 1, top: 0, right: 0, bottom: 1}},
        },
        [LAWN]: {ground: {atlas: "ground", x: 64, y: 0, width: 64, height: 64}},
        [ROADS]: {ground: {atlas: "ground", x: 128, y: 0, width: 64, height: 64}},
        [TRAFFIC]: {
            ground: {atlas: "ground", x: 192, y: 0, width: 64, height: 64},
            objects: {atlas: "objects", x: 192, y: 0, width: 64, height: 64},
            shadow: {atlas: "shadows", x: 128, y: 0, width: 64, height: 64, reach: {left: 0, top: 0, right: 0, bottom: 0}},
        },
    },
    sprites: {},
    cars: {red: {north: {atlas: "objects", x: 256, y: 0, width: 64, height: 64}}},
    grass: plainGrass({atlas: "ground", x: 0, y: 0, width: 64, height: 64}),
    canopy: plainCanopy({atlas: "ground", x: 0, y: 0, width: 64, height: 64}),
};
const art = new RenderArt(parseRenderManifest(artJson));

// The floats past a quad's of a ground quad that lets no grass through
const NO_GRASS = new Array(GROUND_QUAD_FLOATS - QUAD_FLOATS).fill(0);

// A quad as its floats: where it lands, where it comes from, and its colour
interface Quad {
    target: number[];
    source: number[];
    colour: number[];
}

function quads(list: RunList<Run>): {atlas: string, quads: Quad[]}[] {
    return list.runs.map((run) => {
        const found: Quad[] = [];
        for (let i = 0; i < run.count; i++) {
            // a quad's floats, of a ground quad those it shares with the rest
            const floats = Array.from(run.data.slice(i * run.floatsPerQuad, i * run.floatsPerQuad + QUAD_FLOATS));
            found.push({target: floats.slice(0, 4), source: floats.slice(4, 8), colour: floats.slice(8)});
        }
        return {atlas: run.atlas, quads: found};
    });
}

const OPAQUE = [1, 1, 1, 1];

// The colour a car of the colour given is drawn in, as the buffer holds it, in single floats
function carFloats(colour: number): number[] {
    return [...CAR_COLOURS[colour].flat.map(Math.fround), 1];
}

// The area of a 2 by 1 view with a margin of 1, from map tile (10, 20): 4 by 3 tiles, whose in-view tiles are the
// middle row's two middle ones, the view starting at the first's top-left. The frames are the values, unless given.
function tiles(values: number[], frames: number[] = values): FrameTiles {
    return {x: 10, y: 20, width: 4, height: 3, margin: 1, offset: {x: 0, y: 0}, values, frames};
}

// The area with the tile given at one place and dirt, 0, everywhere else
function tilesWith(index: number, value: number, frame = value): FrameTiles {
    const values = new Array<number>(12).fill(0);
    const frames = values.slice();
    values[index] = value;
    frames[index] = frame;
    return tiles(values, frames);
}

const noTint = () => null;

function build(area: FrameTiles, tilePixels = 16, tint: (x: number, y: number) => Tint | null = noTint,
               sprites: SpriteView[] = [], cars: PaintableCar[] = []): MapFrame {
    const frame = new MapFrame();
    buildMapFrame(frame, art, area, tilePixels, tint, cars, sprites);
    return frame;
}

const dirt = (x: number) => ({target: [x, 0, 16, 16], source: [0, 0, 16, 16], colour: OPAQUE});

describe("a frame of the map", () => {

    it("draws the ground of each tile in view, from the view's origin, from the fallback sheet", () => {
        const origin = tileImageOrigin(LIGHTNINGBOLT);
        const frame = build(tilesWith(6, 0, LIGHTNINGBOLT));

        expect(quads(frame.ground)).toEqual([{atlas: FALLBACK_TILES, quads: [
            dirt(0),
            {target: [16, 0, 16, 16], source: [origin.x, origin.y, 16, 16], colour: OPAQUE},
        ]}]);
        expect([frame.shadows.count, frame.objects.count, frame.tints.count, frame.sprites.count]).toEqual([0, 0, 0, 0]);
    });

    it("draws the frame the animation manager chose, not the tile's value", () => {
        // Index 5 is the first tile in view
        const frame = build(tilesWith(5, LAWN, ZONE));

        expect(quads(frame.ground)[0]).toEqual({atlas: "ground", quads: [
            {target: [0, 0, 16, 16], source: [0, 0, 64, 64], colour: OPAQUE},
        ]});
    });

    it("draws nothing off the map", () => {
        const values = new Array<number>(12).fill(TILE_INVALID);
        values[6] = 0;

        expect(quads(build(tiles(values)).ground)).toEqual([{atlas: FALLBACK_TILES, quads: [dirt(16)]}]);
    });

    it("draws the objects of a tile that has them, and draws each atlas's quads in one run", () => {
        const values = new Array<number>(12).fill(0);
        values[5] = ZONE;
        values[6] = LAWN;
        const frame = build(tiles(values), 32);

        expect(quads(frame.ground)).toEqual([{atlas: "ground", quads: [
            {target: [0, 0, 32, 32], source: [0, 0, 64, 64], colour: OPAQUE},
            {target: [32, 0, 32, 32], source: [64, 0, 64, 64], colour: OPAQUE},
        ]}]);
        expect(quads(frame.objects)).toEqual([{atlas: "objects", quads: [
            {target: [0, 0, 32, 32], source: [64, 0, 64, 64], colour: OPAQUE},
        ]}]);
    });

    it("draws an anchor's shadow whole, over the tiles it reaches past the anchor", () => {
        // In view at (1, 0): the shadow covers it, a tile left and a tile down
        const frame = build(tilesWith(6, ZONE), 32);

        expect(quads(frame.shadows)).toEqual([{atlas: "shadows", quads: [
            {target: [0, 0, 64, 64], source: [0, 0, 128, 128], colour: OPAQUE},
        ]}]);
    });

    it("draws the shadows of anchors in the margin around the view, whose shadows reach into it", () => {
        // The top-right corner of the area, a tile up and right of the view: its shadow reaches down and left into it
        const frame = build(tilesWith(3, ZONE));

        expect(quads(frame.shadows)).toEqual([{atlas: "shadows", quads: [
            {target: [16, -16, 32, 32], source: [0, 0, 128, 128], colour: OPAQUE},
        ]}]);
        expect(quads(frame.objects)).toEqual([]);
    });

    // In view at (0, 0), beside dirt: the traffic's own art would draw its cars' objects and their shadow
    it("draws traffic as the plain road it runs on, every layer, its shadow among them", () => {
        const frame = build(tilesWith(5, TRAFFIC | ANIMBIT, TRAFFIC));

        expect(quads(frame.ground)).toEqual([
            {atlas: "ground", quads: [{target: [0, 0, 16, 16], source: [128, 0, 64, 64], colour: OPAQUE}]},
            {atlas: FALLBACK_TILES, quads: [{target: [16, 0, 16, 16], source: [0, 0, 16, 16], colour: OPAQUE}]},
        ]);
        expect([frame.objects.count, frame.shadows.count]).toEqual([0, 0]);
    });

    it("draws the shadow of an anchor whose frame blinks to the lightning bolt, from its value", () => {
        const unpowered = ZONE | ZONEBIT;
        const frame = build(tilesWith(5, unpowered, LIGHTNINGBOLT));

        expect(frame.shadows.count).toBe(1);
        expect(quads(frame.ground)[0].atlas).toBe(FALLBACK_TILES);
        expect(build(tilesWith(5, ZONE | ZONEBIT | POWERBIT, ZONE)).shadows.count).toBe(1);
    });

    it("tints each tile in view the overlay tints, premultiplied, from the white pixel", () => {
        const asked: string[] = [];
        const tint = (x: number, y: number): Tint | null => {
            asked.push(`${x},${y}`);
            return x === 11 ? {r: 255, g: 0, b: 102, a: 0.5} : null;
        };
        const frame = build(tilesWith(0, 0), 16, tint);

        expect(asked).toEqual(["11,21", "12,21"]);
        expect(quads(frame.tints)).toEqual([{atlas: WHITE, quads: [
            // The buffer holds single floats
            {target: [0, 0, 16, 16], source: [0, 0, 1, 1], colour: [0.5, 0, Math.fround(0.2), 0.5]},
        ]}]);
    });

    it("draws each sprite in its square, from the view's origin in map pixels, scaled to the zoom", () => {
        // The view's origin is map tile (11, 21): map pixels (176, 336)
        const train = {type: 1, frame: 2, x: 180, y: 340, width: 32};
        const monster = {type: 5, frame: 16, x: 160, y: 336, width: 48};
        const frame = build(tilesWith(0, 0), 32, noTint, [train, monster]);

        expect(quads(frame.sprites)).toEqual([{atlas: FALLBACK_SPRITES, quads: [
            {target: [8, 8, 64, 64], source: [48, 0, 32, 32], colour: OPAQUE},
            {target: [-32, 0, 96, 96], source: [15 * 48, 4 * 48, 48, 48], colour: OPAQUE},
        ]}]);
    });

    // The art has the red car facing north, and no other
    it("draws each car under the sprites, from its art filling its square, or else a flat rectangle long its way", () => {
        // The view's origin is map tile (11, 21): map pixels (176, 336), at 64 device pixels a tile, so a car's square
        // of a tile is 64 device pixels, and a car with no art 17 by 7 of them, in its middle
        const north = {kind: "road", x: 180, y: 340, width: 16, direction: "north", colour: 0, opacity: 1} as const;
        const east = {kind: "road", x: 200, y: 340, width: 16, direction: "east", colour: 0, opacity: 1} as const;
        const southBlue = {kind: "road", x: 220, y: 340, width: 16, direction: "south", colour: 1, opacity: 1} as const;
        const helicopter = {type: 2, frame: 2, x: 180, y: 340, width: 32};
        const frame = build(tilesWith(0, 0), 64, noTint, [helicopter], [north, east, southBlue]);

        expect([CAR_LENGTH * 64, CAR_BREADTH * 64]).toEqual([17, 7]);
        expect(quads(frame.sprites)).toEqual([
            {atlas: "objects", quads: [{target: [16, 16, 64, 64], source: [256, 0, 64, 64], colour: OPAQUE}]},
            {atlas: WHITE, quads: [
                {target: [96 + (64 - 17) / 2, 16 + (64 - 7) / 2, 17, 7], source: [0, 0, 1, 1], colour: carFloats(0)},
                {target: [176 + (64 - 7) / 2, 16 + (64 - 17) / 2, 7, 17], source: [0, 0, 1, 1], colour: carFloats(1)},
            ]},
            {atlas: FALLBACK_SPRITES, quads: [{target: [16, 16, 128, 128], source: [48, 48, 32, 32], colour: OPAQUE}]},
        ]);
    });

    // A car fading out shows as much of itself as its opacity: its tint premultiplied by it, from its art or in its flat
    // colour alike, as the renderer blends premultiplied colours
    it("draws a car fading out with its art's tint, or its flat colour, premultiplied by its opacity", () => {
        const north = {kind: "road", x: 180, y: 340, width: 16, direction: "north", colour: 0, opacity: 0.25} as const;
        const east = {kind: "road", x: 200, y: 340, width: 16, direction: "east", colour: 0, opacity: 0.5} as const;
        const frame = build(tilesWith(0, 0), 64, noTint, [], [north, east]);

        const [red, green, blue] = CAR_COLOURS[0].flat;
        expect(quads(frame.sprites).map(({quads: found}) => found[0].colour)).toEqual([
            [0.25, 0.25, 0.25, 0.25],
            [red * 0.5, green * 0.5, blue * 0.5, 0.5].map(Math.fround),
        ]);
    });

    // The trains' art is the sprite sheet's first row: its first frame the train running north and south, its second
    // east and west
    it("draws each car of a train under the sprites, from the trains' art the way it runs, filling its square", () => {
        const down = {kind: "rail", x: 180, y: 340, width: 16, direction: "south"} as const;
        const across = {kind: "rail", x: 200, y: 340, width: 16, direction: "west"} as const;
        const helicopter = {type: 2, frame: 2, x: 180, y: 340, width: 32};
        const frame = build(tilesWith(0, 0), 64, noTint, [helicopter], [down, across]);

        expect(quads(frame.sprites)).toEqual([{atlas: FALLBACK_SPRITES, quads: [
            {target: [16, 16, 64, 64], source: [0, 0, 32, 32], colour: OPAQUE},
            {target: [96, 16, 64, 64], source: [48, 0, 32, 32], colour: OPAQUE},
            {target: [16, 16, 128, 128], source: [48, 48, 32, 32], colour: OPAQUE},
        ]}]);
    });

    it("draws tiles and sprites from a view that starts inside its first tile, by the offset into it", () => {
        // The view's top-left is 5 device pixels right of and 3 below map pixel (176, 336)'s, at 16 a tile
        const area = {...tilesWith(6, 0), offset: {x: 5, y: 3}};
        const train = {type: 1, frame: 2, x: 180, y: 340, width: 32};
        const frame = build(area, 16, noTint, [train]);

        expect(quads(frame.ground)).toEqual([{atlas: FALLBACK_TILES, quads: [
            {target: [-5, -3, 16, 16], source: [0, 0, 16, 16], colour: OPAQUE},
            {target: [11, -3, 16, 16], source: [0, 0, 16, 16], colour: OPAQUE},
        ]}]);
        expect(quads(frame.sprites)).toEqual([{atlas: FALLBACK_SPRITES, quads: [
            {target: [-1, 1, 32, 32], source: [48, 0, 32, 32], colour: OPAQUE},
        ]}]);
    });

    it("fails on a sprite no art draws, naming it", () => {
        expect(() => build(tilesWith(0, 0), 16, noTint, [{type: 6, frame: 4, x: 0, y: 0, width: 48}]))
            .toThrow("No art draws sprite 6 frame 4");
    });

    it("starts again from nothing on each frame, keeping its runs' buffers", () => {
        const frame = new MapFrame();
        buildMapFrame(frame, art, tilesWith(6, ZONE), 16, noTint, [], []);
        const buffer = frame.ground.runs[0].data;
        buildMapFrame(frame, art, tilesWith(6, 0), 16, noTint, [], []);

        expect(quads(frame.ground)).toEqual([{atlas: FALLBACK_TILES, quads: [dirt(0), dirt(16)]}]);
        expect(frame.shadows.count).toBe(0);
        expect(frame.ground.runs[0].data).toBe(buffer);
    });

    describe("drawn again in part", () => {

        // The device pixels of the view's first tile, and of its second, at 16 a tile
        const left = [{x: 0, y: 0, width: 16, height: 16}];
        const right = [{x: 16, y: 0, width: 16, height: 16}];

        function buildIn(area: FrameTiles, areas: Rect[], sprites: SpriteView[] = [], tilePixels = 16,
                         cars: PaintableCar[] = []): MapFrame {
            const frame = new MapFrame();
            buildMapFrame(frame, art, area, tilePixels, noTint, cars, sprites, areas);
            return frame;
        }

        it("draws only the tiles in the areas", () => {
            const frame = buildIn(tilesWith(6, ZONE), left);

            expect(quads(frame.ground)).toEqual([{atlas: FALLBACK_TILES, quads: [dirt(0)]}]);
            expect(frame.objects.count).toBe(0);
        });

        it("draws a tile beside an area whose edge falls within the area's first pixel", () => {
            // At 17.6 device pixels a tile, the first tile runs to 17.6; the second tile's pixels, rounded out, are
            // 17 to 36
            const frame = buildIn(tilesWith(6, 0), [{x: 17, y: 0, width: 19, height: 18}], [], 17.6);

            expect(frame.ground.count).toBe(2);
        });

        it("draws a shadow that reaches into an area from an anchor outside it", () => {
            expect(buildIn(tilesWith(6, ZONE), left).shadows.count).toBe(1);
        });

        it("leaves out a shadow that doesn't reach an area", () => {
            expect(buildIn(tilesWith(5, ZONE), right).shadows.count).toBe(0);
        });

        it("draws none of the map for no areas", () => {
            const frame = buildIn(tilesWith(6, ZONE), []);

            expect([frame.ground.count, frame.shadows.count, frame.objects.count]).toEqual([0, 0, 0]);
        });

        it("draws every car and sprite, wherever the areas are: they are drawn over the whole map", () => {
            // The view's origin is map pixel (176, 336); the train covers the view's second tile, and the cars are in
            // its second tile and in its first
            const train = {type: 1, frame: 2, x: 192, y: 336, width: 16};
            const inRight = {kind: "road", x: 196, y: 340, width: 7, direction: "south", colour: 2, opacity: 1} as const;
            const inLeft = {kind: "road", x: 180, y: 340, width: 7, direction: "west", colour: 3, opacity: 1} as const;

            const drawn = quads(buildIn(tilesWith(0, 0), [], [train], 16, [inRight, inLeft]).sprites);

            expect(drawn.map(({atlas, quads: found}) => ({atlas, quads: found.length})))
                .toEqual([{atlas: WHITE, quads: 2}, {atlas: FALLBACK_SPRITES, quads: 1}]);
            expect(drawn[0].quads.map((quad) => quad.colour)).toEqual([carFloats(2), carFloats(3)]);
        });
    });

    describe("a list of quads", () => {

        const box = {x: 0, y: 0, width: 1, height: 1};

        it("draws an ordered list's quads in the order added, a run each time the atlas changes", () => {
            const list = new QuadList(true);
            ["a", "a", "b", "a"].forEach((atlas) => list.add(atlas, 0, 0, 1, 1, box));

            expect(list.runs.map((run) => [run.atlas, run.count])).toEqual([["a", 2], ["b", 1], ["a", 1]]);
        });

        it("draws an unordered list's quads one run per atlas", () => {
            const list = new QuadList(false);
            ["a", "a", "b", "a"].forEach((atlas) => list.add(atlas, 0, 0, 1, 1, box));

            expect(list.runs.map((run) => [run.atlas, run.count])).toEqual([["a", 3], ["b", 1]]);
        });

        it.each([["an ordered", true], ["an unordered", false]])(
            "draws %s list's next frame from its own atlas, in a run kept from one of another atlas", (_, ordered) => {
            const list = new QuadList(ordered);
            list.add("a", 0, 0, 1, 1, box);
            const kept = list.runs[0];
            list.clear();
            list.add("b", 0, 0, 1, 1, box);

            expect(list.runs.map((run) => [run.atlas, run.count])).toEqual([["b", 1]]);
            expect(list.runs[0]).toBe(kept);
        });

        it("grows its buffers to hold every quad", () => {
            const list = new QuadList(false);
            for (let i = 0; i < 1000; i++) {
                list.add("a", i, 0, 1, 1, box);
            }

            expect(list.count).toBe(1000);
            expect(list.runs[0].floats.length).toBe(1000 * QUAD_FLOATS);
            expect(list.runs[0].floats[999 * QUAD_FLOATS]).toBe(999);
        });

        it("grows a ground list's buffers to hold every ground quad, each its grass floats after the quad's", () => {
            const list = new GroundList();
            const grass = {lush: box, straw: box, through: "part" as const, mapX: 7, mapY: 3, canopy: null};
            const canopy = {tile: {x: 64, y: 128, width: 64, height: 64}, woods: 0b000010000};
            for (let i = 0; i < 1000; i++) {
                list.addGround("a", i, 0, 1, 1, box, i === 999 ? grass : i === 997 ? {...grass, canopy} : null);
            }

            const floats = list.runs[0].floats;
            const quad = (i: number) => Array.from(floats.slice(i * GROUND_QUAD_FLOATS, (i + 1) * GROUND_QUAD_FLOATS));
            expect(floats.length).toBe(1000 * GROUND_QUAD_FLOATS);
            expect(quad(999)).toEqual([999, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 7, 3,
                                       GROUND_OVER_GRASS, 0, 0, 0, 0, 0]);
            expect(quad(998).slice(QUAD_FLOATS)).toEqual(NO_GRASS);
            expect(quad(997).slice(QUAD_FLOATS + 10)).toEqual([GROUND_OVER_GRASS, 16, 64, 128, 64, 64]);
        });
    });

    describe("the whole map", () => {

        // A 2 by 2 map of a powered zone centre, a lawn, the zone tile with no flags, and dirt, and the areas read of it
        const values = [ZONE | ZONEBIT | POWERBIT, LAWN, ZONE, 0];
        function newMap() {
            const reads: number[][] = [];
            const map = {
                width: 2,
                height: 2,
                getTileValuesForPainting: (x: number, y: number, w: number, h: number, result: number[]) => {
                    reads.push([x, y, w, h]);
                    values.forEach((value, i) => result[i] = value);
                    return result;
                },
            };
            return {map, reads};
        }

        it("reads every tile with no margin, and draws each tile's own id, without its flags", () => {
            const {map, reads} = newMap();

            expect(wholeMapTiles(map)).toEqual({x: 0, y: 0, width: 2, height: 2, margin: 0, offset: {x: 0, y: 0},
                                                values, frames: [ZONE, LAWN, ZONE, 0]});
            expect(reads).toEqual([[0, 0, 2, 2]]);
        });

        it("draws the shadow of a tile at the map's edge, though it reaches past the edge, where nothing lies", () => {
            const frame = new MapFrame();
            buildMapFrame(frame, art, wholeMapTiles(newMap().map), 3, noTint, [], []);

            // Both zone tiles are in the first column, and cast their shadow a tile left and down
            expect(frame.shadows.count).toBe(2);
        });
    });

    describe("the world grass", () => {

        // The art above with the committed manifest's world grass, each set's tile i at (64 i, 0) in its own atlas, lush
        // in the first row and straw in the second, and grounds that let it through: bare land's all over, the lawn's in
        // part, the zone's none
        const grassJson = committedGrass((set, i) => ({atlas: "grass", x: 64 * i, y: set === "lush" ? 0 : 64,
                                                      width: 64, height: 64}));
        // and the committed canopy, its tile i at (64 i, 128)
        const canopyJson = committedCanopy((i) => ({atlas: "grass", x: 64 * i, y: 128, width: 64, height: 64}));
        const grassy = new RenderArt(parseRenderManifest({
            ...artJson,
            atlases: {...artJson.atlases, grass: "grass.png"},
            tiles: {...artJson.tiles, 0: {ground: {atlas: "ground", x: 256, y: 0, width: 64, height: 64}, grass: "all"},
                    [LAWN]: {...artJson.tiles[LAWN], grass: "part"}},
            grass: grassJson,
            canopy: canopyJson,
        }));

        // Each ground quad's grass floats: its tile's rectangle in each set, and its map tile
        function grassOf(frame: MapFrame): number[][] {
            return frame.ground.runs.flatMap((run) => Array.from({length: run.count}, (_, i) =>
                Array.from(run.data.slice(i * run.floatsPerQuad + QUAD_FLOATS, (i + 1) * run.floatsPerQuad))));
        }

        it("draws each ground that lets the grass through over the tile its map tile's corners pick in each set", () => {
            const frame = new MapFrame();
            buildMapFrame(frame, grassy, tilesWith(5, LAWN), 16, noTint, [], []);
            const constants = grassy.grass!.constants;

            // The two tiles in view, map tiles (11, 21), the lawn, ground over grass, and (12, 21), bare land, grass alone
            expect(grassOf(frame)).toEqual([[11, 21, GROUND_OVER_GRASS], [12, 21, GROUND_GRASS_ONLY]]
                .map(([x, y, draws]) => {
                    const picked = grassTile(x, y, constants);
                    return [64 * picked, 0, 64, 64, 64 * picked, 64, 64, 64, x, y, draws, 0, 0, 0, 0, 0];
                }));
        });

        it("draws a ground that lets no grass through alone", () => {
            const frame = new MapFrame();
            buildMapFrame(frame, grassy, tilesWith(6, ZONE), 16, noTint, [], []);

            // Bare land, then the zone
            expect(grassOf(frame).map((floats) => floats[10])).toEqual([GROUND_GRASS_ONLY, GROUND_ONLY]);
            expect(grassOf(frame)[1]).toEqual(NO_GRASS);
        });

        it("names the grass's atlas, field and colours for the renderer", () => {
            const frame = new MapFrame();
            buildMapFrame(frame, grassy, tilesWith(5, LAWN), 16, noTint, [], []);

            expect(frame.grass).toEqual(expect.objectContaining({atlas: "grass", field: GRASS_FIELD,
                                                                 fieldTiles: {width: 120, height: 100}}));
            expect(frame.grass!.strawMean.map((c) => Math.round(c * 255)))
                .toEqual(grassy.grass!.straw.mean.map(Math.round));
        });

        it.each([[16, 2], [32, 1], [48, Math.log2(64 / 48)], [64, 0], [128, 0]])(
            "samples the grass's 64 px tiles drawn %p px a side at mip level %p", (tilePixels, level) => {
                const frame = new MapFrame();
                buildMapFrame(frame, grassy, tilesWith(5, LAWN), tilePixels, noTint, [], []);

                expect(frame.grassLevel).toBeCloseTo(level, 12);
            });

        it("draws every ground alone where no tile's ground lets the grass through", () => {
            const frame = build(tilesWith(5, LAWN));

            expect(grassOf(frame)).toEqual([NO_GRASS, NO_GRASS]);
        });

        describe("the canopy", () => {

            const WOODS_TILE = WOODS_LOW + 3;
            // The art above with the woods' ground letting all the grass through, as the committed manifest's does
            const wooded = new RenderArt(parseRenderManifest({
                ...artJson,
                atlases: {...artJson.atlases, grass: "grass.png"},
                tiles: {...artJson.tiles, 0: {ground: {atlas: "ground", x: 256, y: 0, width: 64, height: 64}, grass: "all"},
                        [LAWN]: {...artJson.tiles[LAWN], grass: "part"},
                        [WOODS_TILE]: {ground: {atlas: "ground", x: 256, y: 0, width: 64, height: 64}, grass: "all"}},
                grass: grassJson,
                canopy: canopyJson,
            }));

            // The canopy floats of each ground quad: the woods round it, and its canopy tile's rectangle
            function canopyOf(area: FrameTiles, drawnWith = wooded): number[][] {
                const frame = new MapFrame();
                buildMapFrame(frame, drawnWith, area, 16, noTint, [], []);
                return grassOf(frame).map((floats) => floats.slice(11));
            }

            // The canopy tile map tile (x, y) draws, its woods given: picked by the canopy's own seed, worked out here
            // apart from the art's, so a canopy picked by the grass's seed fails
            function canopyAt(x: number, y: number, woods: number): number[] {
                const seed = canopyJson.corners.seed as number;
                const picked = grassTile(x, y, {colours: grassJson.colours, corners: {seed}});
                return [woods, 64 * picked, 128, 64, 64];
            }

            it("is drawn from the woods' own tiles, by every woods id", () => {
                expect([20, 21, 37, 39, 40].map(isWoods)).toEqual([false, true, true, true, false]);
            });

            it("marks the woods round a tile, its own in the middle, a bit for each", () => {
                // Woods at the area's top-left, its top row's third tile, and its middle row's second, of 4 by 3
                const values = [WOODS_TILE, 0, WOODS_TILE, 0, 0, WOODS_TILE, 0, 0, 0, 0, 0, 0];
                const area = {width: 4, height: 3, values};

                // Round the middle row's second tile: north-west 0, north-east 2, its own 4
                expect(woodsAround(area, 1, 1)).toBe(0b000010101);
                // Round the middle row's third: north 1, west 3
                expect(woodsAround(area, 2, 1)).toBe(0b000001010);
                // The woods' flags and animation are no part of it
                expect(woodsAround({...area, values: values.map((v) => v === 0 ? v : v | BURNBIT)}, 1, 1))
                    .toBe(0b000010101);
            });

            it("takes the woods of the map's edge for the tiles past it, as if the map ran on", () => {
                // A 2 by 2 map, woods along its top row: past the top, and past the sides of the top row, is woods
                const area = {width: 2, height: 2, values: [WOODS_TILE, WOODS_TILE, 0, 0]};
                expect(woodsAround(area, 0, 0)).toBe(0b000111111);
                // North-east of the bottom-right tile lies past the east edge, and takes the top-right tile's woods
                expect(woodsAround(area, 1, 1)).toBe(0b000000111);
                // And off the map in the area a view reads, past its edge
                const offMap = {width: 3, height: 2, values: [TILE_INVALID, WOODS_TILE, 0, TILE_INVALID, 0, 0]};
                expect(woodsAround(offMap, 1, 1)).toBe(0b000000011);
            });

            it("draws over woods, and over bare land beside them, from the woods round each", () => {
                // Woods at the view's first tile, map tile (11, 21), and bare land beside it at (12, 21)
                expect(canopyOf(tilesWith(5, WOODS_TILE))).toEqual([canopyAt(11, 21, 0b000010000),
                                                                    canopyAt(12, 21, 0b000001000)]);
            });

            it("draws over bare land with woods only at a corner, from the woods in the margin", () => {
                // Woods in the margin's top-left corner, north-west of the first tile in view
                expect(canopyOf(tilesWith(0, WOODS_TILE))).toEqual([canopyAt(11, 21, 0b000000001), [0, 0, 0, 0, 0]]);
            });

            it("draws over a ground that lets the grass through in part, from the woods round it, so it ends on no edge", () => {
                // Woods in the margin west of the first tile in view, the lawn, whose ground lets the grass through in
                // part, and two from the second, bare land, which draws none
                const values = tilesWith(5, LAWN).values.slice();
                values[4] = WOODS_TILE;
                expect(canopyOf(tiles(values))).toEqual([canopyAt(11, 21, 0b000001000), [0, 0, 0, 0, 0]]);
            });

            it("draws none over a ground that lets no grass through, though woods stand round it", () => {
                // The zone beside woods in the margin west of it
                const values = tilesWith(5, ZONE).values.slice();
                values[4] = WOODS_TILE;
                expect(canopyOf(tiles(values))).toEqual([NO_GRASS.slice(11), [0, 0, 0, 0, 0]]);
            });

            it("draws none over woods whose ground lets no grass through, and still over the bare land beside", () => {
                expect(canopyOf(tilesWith(5, WOODS_TILE), grassy).map((floats) => floats[0])).toEqual([0, 0b000001000]);
            });
        });
    });
});
