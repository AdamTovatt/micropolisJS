/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
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

import { FrameRecord, FrameTiles, MapFrame, QUAD_FLOATS, QuadList, buildMapFrame } from "../src/mapFrame";
import type { Tint } from "../src/overlayRenderer";
import type { SpriteView } from "../src/protocol";
import { FALLBACK_SPRITES, FALLBACK_TILES, RenderArt, WHITE, parseRenderManifest } from "../src/renderManifest";
import { tileImageOrigin } from "../src/tileSet";
import { POWERBIT, ZONEBIT } from "../src/tileFlags";
import { LIGHTNINGBOLT, TILE_INVALID } from "../src/tileValues";

// Tile 5 is rendered: ground, objects, and a shadow reaching a tile left and a tile down. Tile 6 has rendered ground
// only. Every other id falls back.
const ZONE = 5;
const LAWN = 6;
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
    },
    sprites: {},
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

// The area of a 2 by 1 view with a margin of 1, from map tile (10, 20): 4 by 3 tiles, whose in-view tiles are the
// middle row's two middle ones. The frames are the values, unless given.
function tiles(values: number[], frames: number[] = values): FrameTiles {
    return {x: 10, y: 20, width: 4, height: 3, margin: 1, values, frames};
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
               sprites: SpriteView[] = []): MapFrame {
    const frame = new MapFrame();
    buildMapFrame(frame, art, area, tilePixels, tint, sprites);
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

    it("fails on a sprite no art draws, naming it", () => {
        expect(() => build(tilesWith(0, 0), 16, noTint, [{type: 6, frame: 4, x: 0, y: 0, width: 48}]))
            .toThrow("No art draws sprite 6 frame 4");
    });

    it("starts again from nothing on each frame, keeping its runs' buffers", () => {
        const frame = new MapFrame();
        buildMapFrame(frame, art, tilesWith(6, ZONE), 16, noTint, []);
        const buffer = frame.ground.runs[0].data;
        buildMapFrame(frame, art, tilesWith(6, 0), 16, noTint, []);

        expect(quads(frame.ground)).toEqual([{atlas: FALLBACK_TILES, quads: [dirt(0), dirt(16)]}]);
        expect(frame.shadows.count).toBe(0);
        expect(frame.ground.runs[0].data).toBe(buffer);
    });

    describe("the record of the frame drawn last", () => {

        const train = {type: 1, frame: 2, x: 180, y: 340, width: 32};
        const view = {originX: 11, originY: 21, tilePixels: 16, width: 640, height: 480};

        // A record of a frame of the view, the zone at index 5 and the train
        function recorded(): FrameRecord {
            const record = new FrameRecord();
            record.changed(view, tilesWith(5, ZONE), [train]);
            return record;
        }

        it("tells a first frame from nothing", () => {
            expect(new FrameRecord().changed(view, tilesWith(5, ZONE), [train])).toBe(true);
        });

        it("tells the same frame again, in a view of the same values, from a new one", () => {
            expect(recorded().changed({...view}, tilesWith(5, ZONE), [{...train}])).toBe(false);
        });

        it.each([
            ["origin's column", {originX: 12}],
            ["origin's row", {originY: 22}],
            ["pixels a tile", {tilePixels: 32}],
            ["width", {width: 641}],
            ["height", {height: 481}],
        ])("draws again when the view's %s changes", (_, change) => {
            expect(recorded().changed({...view, ...change}, tilesWith(5, ZONE), [train])).toBe(true);
        });

        it("draws again when a tile's value changes, though its frame doesn't", () => {
            expect(recorded().changed(view, tilesWith(5, ZONE | ZONEBIT, ZONE), [train])).toBe(true);
        });

        it("draws again when a tile's frame changes, though its value doesn't", () => {
            expect(recorded().changed(view, tilesWith(5, ZONE, LIGHTNINGBOLT), [train])).toBe(true);
        });

        it("draws again when a sprite changes", () => {
            expect(recorded().changed(view, tilesWith(5, ZONE), [{...train, frame: 3}])).toBe(true);
        });

        it("draws again after it is invalidated, then not again", () => {
            const record = recorded();
            record.invalidate();

            expect([record.changed(view, tilesWith(5, ZONE), [train]), record.changed(view, tilesWith(5, ZONE), [train])])
                .toEqual([true, false]);
        });

        it("keeps its own copy of the view", () => {
            const record = new FrameRecord();
            const shown = {...view};
            record.changed(shown, tilesWith(5, ZONE), []);
            shown.originX = 12;

            expect(record.changed(shown, tilesWith(5, ZONE), [])).toBe(true);
        });

        it("keeps its own copy of the tiles, which the canvas fills again on each paint", () => {
            const record = new FrameRecord();
            const area = tilesWith(5, ZONE);
            record.changed(view, area, []);
            (area.values as number[])[5] = LAWN;

            expect(record.changed(view, area, [])).toBe(true);
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
});
