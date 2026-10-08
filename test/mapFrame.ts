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
import { CAR_BREADTH, CAR_LENGTH, FrameTiles, MapFrame, QUAD_FLOATS, QuadList, buildMapFrame, wholeMapTiles } from "../src/mapFrame";
import type { Tint } from "../src/overlayRenderer";
import type { SpriteView } from "../src/protocol";
import type { Rect } from "../src/rect";
import { FALLBACK_SPRITES, FALLBACK_TILES, RenderArt, WHITE, parseRenderManifest } from "../src/renderManifest";
import { tileImageOrigin } from "../src/tileSet";
import { ANIMBIT, POWERBIT, ZONEBIT } from "../src/tileFlags";
import { LIGHTNINGBOLT, LTRFBASE, ROADBASE, ROADS, TILE_INVALID } from "../src/tileValues";

// Tile 5 is rendered: ground, objects, and a shadow reaching a tile left and a tile down. Tile 6 has rendered ground
// only. Light traffic on a plain road has the art of its own the painted traffic had, its cars' shadow among it, and the
// plain road ground only. Every other id falls back.
const ZONE = 5;
const LAWN = 6;
const TRAFFIC = LTRFBASE + (ROADS - ROADBASE);
const art = new RenderArt(parseRenderManifest({
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
}));

// A quad as its floats: where it lands, where it comes from, and its colour
interface Quad {
    target: number[];
    source: number[];
    colour: number[];
}

function quads(list: QuadList): {atlas: string, quads: Quad[]}[] {
    return list.runs.map((run) => {
        const found: Quad[] = [];
        for (let i = 0; i < run.count; i++) {
            const floats = Array.from(run.data.slice(i * QUAD_FLOATS, (i + 1) * QUAD_FLOATS));
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
});
