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

import { ANIMATION_PERIOD } from "../src/animationManager";
import type { PaintableCar } from "../src/cars";
import { ClientMap } from "../src/cityState";
import { MapFrame, QUAD_FLOATS } from "../src/mapFrame";
import type { QuadList } from "../src/mapFrame";
import { MapPainter } from "../src/mapPainter";
import type { Rect } from "../src/rect";
import { RenderArt, parseRenderManifest } from "../src/renderManifest";
import { ANIMBIT, ZONEBIT } from "../src/tileFlags";
import { FIRE, LIGHTNINGBOLT } from "../src/tileValues";
import { plainCanopy, plainGrass } from "./helpers/grassArt";

// Tile 5 casts a shadow reaching a tile left and a tile down, so the farthest shadow reaches one tile
const ZONE = 5;
const art = new RenderArt(parseRenderManifest({
    version: 1,
    atlases: {ground: "ground.png", shadows: "shadows.png"},
    tiles: {
        [ZONE]: {
            ground: {atlas: "ground", x: 0, y: 0, width: 64, height: 64},
            shadow: {atlas: "shadows", x: 0, y: 0, width: 128, height: 128, reach: {left: 1, top: 0, right: 0, bottom: 1}},
        },
    },
    sprites: {},
    cars: {},
    grass: plainGrass({atlas: "ground", x: 0, y: 0, width: 64, height: 64}),
    canopy: plainCanopy({atlas: "ground", x: 0, y: 0, width: 64, height: 64}),
}));

const MAP_WIDTH = 40;
const MAP_HEIGHT = 30;

// A view of 4 by 3 tiles from map tile (10, 5), at 16 device pixels a tile
const VIEW = {origin: {x: 10, y: 5}, across: 4, down: 3, tilePixels: 16};

// A view of 24 by 16 tiles from the same tile, six blocks of tiles, so a change in one of them draws part of the view
const WIDE = {...VIEW, across: 24, down: 16};

// What the renderer was asked to draw: each frame's ground quads, by atlas and where they come from, where each of its
// cars and sprites lands, in order, the areas of the layer drawn again, and the areas the layer is copied over
interface Drawn {
    ground: {atlas: string, x: number, y: number}[];
    sprites: Rect[];
    areas: readonly Rect[] | null;
    composite: readonly Rect[] | null;
}

// Whether the areas cover every pixel of the rectangle
function covers(areas: readonly Rect[], {x, y, width, height}: Rect): boolean {
    for (let py = y; py < y + height; py++) {
        for (let px = x; px < x + width; px++) {
            const inside = areas.some((area) => px >= area.x && px < area.x + area.width && py >= area.y &&
                                                py < area.y + area.height);
            if (!inside) {
                return false;
            }
        }
    }
    return true;
}

function groundOf(frame: MapFrame): Drawn["ground"] {
    return frame.ground.runs.flatMap((run) => {
        const quads = [];
        for (let i = 0; i < run.count; i++) {
            const at = i * run.floatsPerQuad;
            quads.push({atlas: run.atlas, x: run.floats[at + 4], y: run.floats[at + 5]});
        }
        return quads;
    });
}

// Where each quad of the list lands, in device pixels from the target's top-left, in order
function landingOf(list: QuadList): Rect[] {
    return list.runs.flatMap((run) => Array.from({length: run.count}, (_, i) => {
        const [x, y, width, height] = run.floats.slice(i * QUAD_FLOATS, i * QUAD_FLOATS + 4);
        return {x, y, width, height};
    }));
}

// The tile of the view, at 16 device pixels a tile, that the middle of where a quad lands is on
function tileOf({x, y, width, height}: Rect): {column: number, row: number} {
    return {column: Math.floor((x + width / 2) / 16), row: Math.floor((y + height / 2) / 16)};
}

// A painter of a map of dirt, with the tiles given placed on it, drawing on a stand-in for the WebGL renderer
function newPainter(...placed: {x: number, y: number, value: number}[]) {
    const tiles = new Array<number>(MAP_WIDTH * MAP_HEIGHT).fill(0);
    for (const {x, y, value} of placed) {
        tiles[y * MAP_WIDTH + x] = value;
    }
    const map = new ClientMap({width: MAP_WIDTH, height: MAP_HEIGHT, tiles});
    const reads = jest.spyOn(map, "getTileValuesForPainting");

    const drawn: Drawn[] = [];
    const picture = new Uint8ClampedArray(4);
    const renderer = {
        busy: false,
        needsWholeLayer: false,
        draw: (frame: MapFrame, areas: readonly Rect[] | null, composite: readonly Rect[] | null) => {
            drawn.push({ground: groundOf(frame), sprites: landingOf(frame.sprites), areas, composite});
        },
        drawOffscreen: jest.fn<Uint8ClampedArray, [MapFrame, number, number]>(() => picture),
        release: jest.fn(),
    };

    // The wide view's size, in device pixels
    const painter = new MapPainter({width: WIDE.across * 16, height: WIDE.down * 16}, map, art, renderer);
    return {painter, map, reads, drawn, renderer, picture};
}

const noTint = () => null;

// A car facing east on the tile column across and row down from the wide view's origin
function carAt(column: number, row: number): PaintableCar {
    return {kind: "road", x: (WIDE.origin.x + column) * 16, y: (WIDE.origin.y + row) * 16, width: 16, direction: "east",
            colour: 0, opacity: 1};
}

describe("a painter of the map", () => {

    it("reads the tiles in view and a margin around them as wide as a tile's look reaches", () => {
        const {painter, reads, drawn} = newPainter();
        const margin = art.reach;

        expect(painter.paint(VIEW, noTint, [], [])).toBe(true);

        expect(margin).toBe(1);
        expect(reads.mock.calls.map((call) => call.slice(0, 4))).toEqual([[
            VIEW.origin.x - margin, VIEW.origin.y - margin, VIEW.across + 2 * margin, VIEW.down + 2 * margin,
        ]]);
        // Only the tiles in view are drawn, whole
        expect(drawn).toHaveLength(1);
        expect(drawn[0].ground).toHaveLength(VIEW.across * VIEW.down);
        expect(drawn[0].areas).toBeNull();
    });

    it("reads a tile more each way from an origin between tiles, whose first and last tiles show in part", () => {
        const {painter, reads, drawn} = newPainter();
        const margin = art.reach;

        // Map pixel (168, 84) at 16 a tile: 8 pixels into tile 10 across and 4 into tile 5 down
        painter.paint({...VIEW, origin: {x: 10.5, y: 5.25}}, noTint, [], []);

        expect(reads.mock.calls.map((call) => call.slice(0, 4))).toEqual([[
            10 - margin, 5 - margin, VIEW.across + 1 + 2 * margin, VIEW.down + 1 + 2 * margin,
        ]]);
        expect(drawn[0].ground).toHaveLength((VIEW.across + 1) * (VIEW.down + 1));
    });

    it("draws the whole view again when its origin moves by a device pixel, and not when it moves by less", () => {
        const {painter, drawn} = newPainter();

        painter.paint(VIEW, noTint, [], []);
        // A sixty-fourth of a tile is a quarter of a pixel at 16 a tile, which the map is drawn from as no move
        expect(painter.paint({...VIEW, origin: {x: 10 + 1 / 64, y: 5}}, noTint, [], [])).toBe(false);
        expect(painter.paint({...VIEW, origin: {x: 10 + 1 / 16, y: 5}}, noTint, [], [])).toBe(true);

        expect(drawn.map((frame) => frame.areas)).toEqual([null, null]);
    });

    it("draws the frame the animation manager picks: an unpowered zone's tile blinks to the lightning bolt", () => {
        const {painter, drawn} = newPainter({x: 10, y: 5, value: ZONE | ZONEBIT});

        painter.paint(VIEW, noTint, [], []);

        const bolt = art.tile(LIGHTNINGBOLT).ground;
        expect(drawn[0].ground[0]).toEqual({atlas: bolt.atlas, x: bolt.x, y: bolt.y});
    });

    it("draws nothing while the renderer is still drawing the frame before, and is behind until a paint draws", () => {
        const {painter, renderer, drawn} = newPainter();
        renderer.busy = true;

        const whileBusy = painter.paint(VIEW, noTint, [], []);
        const currentWhileBusy = painter.current;
        renderer.busy = false;
        const currentOnceDone = painter.current;
        const once = painter.paint(VIEW, noTint, [], []);

        expect([whileBusy, currentWhileBusy, currentOnceDone, once, painter.current])
            .toEqual([false, false, false, true, true]);
        expect(drawn).toHaveLength(1);
    });

    it("draws nothing when nothing changed", () => {
        const {painter, drawn} = newPainter();
        painter.paint(WIDE, noTint, [], []);

        expect(painter.paint(WIDE, noTint, [], [])).toBe(false);
        expect(drawn).toHaveLength(1);
    });

    it("draws again only around a tile that changed", () => {
        const {painter, map, drawn} = newPainter();
        painter.paint(WIDE, noTint, [], []);

        // A tile from the view's origin
        map.change([{x: WIDE.origin.x + 1, y: WIDE.origin.y + 1, value: ZONE}]);

        expect(painter.paint(WIDE, noTint, [], [])).toBe(true);
        expect(drawn[1].areas).not.toBeNull();
        expect(covers(drawn[1].areas!, {x: 16, y: 16, width: 16, height: 16})).toBe(true);
        expect(covers(drawn[1].areas!, {x: 16 * 20, y: 16 * 12, width: 16, height: 16})).toBe(false);
    });

    it("draws a sprite that moved over the map's layer copied where it was and is, drawing none of the layer", () => {
        const {painter, drawn} = newPainter();
        const sprite = {type: 1, frame: 1, x: (WIDE.origin.x + 1) * 16, y: (WIDE.origin.y + 1) * 16, width: 32};
        painter.paint(WIDE, noTint, [], [sprite]);

        expect(painter.paint(WIDE, noTint, [], [{...sprite, x: sprite.x + 16}])).toBe(true);

        expect(drawn.map(({sprites, ground, areas}) => [sprites.length, ground.length, areas]))
            .toEqual([[1, WIDE.across * WIDE.down, null], [1, 0, []]]);
        expect(drawn[0].composite).toBeNull();
        // Where it was, and where it is, in device pixels from the view's origin
        expect(covers(drawn[1].composite!, {x: 16, y: 16, width: 48, height: 32})).toBe(true);
        expect(covers(drawn[1].composite!, {x: 16 * 20, y: 16 * 12, width: 16, height: 16})).toBe(false);
    });

    it("draws a car that moved over the layer copied where it was and is, and none of the cars and sprites far off", () => {
        const {painter, drawn} = newPainter();
        const sprite = {type: 1, frame: 1, x: (WIDE.origin.x + 1) * 16, y: (WIDE.origin.y + 1) * 16, width: 32};
        const car = carAt(20, 12);
        const parked = carAt(10, 12);
        painter.paint(WIDE, noTint, [car, parked], [sprite]);

        expect(painter.paint(WIDE, noTint, [{...car, x: car.x + 1}, parked], [sprite])).toBe(true);

        expect(drawn[0].sprites).toHaveLength(3);
        expect(drawn[1].sprites.map(tileOf)).toEqual([{column: 20, row: 12}]);
        expect(covers(drawn[1].composite!, {x: 16 * 20, y: 16 * 12, width: 17, height: 16})).toBe(true);
        expect(covers(drawn[1].composite!, {x: 16 * 10, y: 16 * 12, width: 16, height: 16})).toBe(false);
    });

    it("draws a car that stands where the layer is copied over, and copies it over the whole of the car", () => {
        const {painter, drawn} = newPainter();
        // A car standing across the edge of the cells the moving car's square is in
        const car = carAt(4, 4);
        const parked = {...car, x: car.x + 24};
        painter.paint(WIDE, noTint, [car, parked], []);

        painter.paint(WIDE, noTint, [{...car, y: car.y + 1}, parked], []);

        expect(drawn[1].sprites.map(tileOf)).toEqual([{column: 4, row: 4}, {column: 6, row: 4}]);
        expect(covers(drawn[1].composite!, {x: 16 * 4 + 24, y: 16 * 4, width: 16, height: 16})).toBe(true);
    });

    it("draws a car standing on a tile that changed, over the layer drawn again there", () => {
        const {painter, map, drawn} = newPainter();
        const car = carAt(1, 1);
        painter.paint(WIDE, noTint, [car], []);

        map.change([{x: WIDE.origin.x + 1, y: WIDE.origin.y + 1, value: ZONE}]);
        painter.paint(WIDE, noTint, [car], []);

        expect(drawn[1].sprites.map(tileOf)).toEqual([{column: 1, row: 1}]);
        expect(covers(drawn[1].composite!, drawn[1].areas![0])).toBe(true);
    });

    // Its square is the same, but it is drawn long the other way
    it("draws a car that turned in its place", () => {
        const {painter, drawn} = newPainter();
        const car = carAt(2, 2);
        painter.paint(WIDE, noTint, [car], []);

        const turned = painter.paint(WIDE, noTint, [{...car, direction: "north"}], []);
        const standing = painter.paint(WIDE, noTint, [{...car, direction: "north"}], []);

        expect([turned, standing]).toEqual([true, false]);
        expect(drawn.map(({areas, sprites}) => [areas, sprites.length])).toEqual([[null, 1], [[], 1]]);
    });

    it("draws a sprite that moved among standing cars, and of them only the car its cells reach", () => {
        const {painter, drawn} = newPainter();
        const sprite = {type: 1, frame: 1, x: (WIDE.origin.x + 8) * 16, y: (WIDE.origin.y + 8) * 16, width: 16};
        // One car in the cell the sprite moves within, and one far off, given before it as the painter is given cars
        const near = carAt(9, 8);
        const far = carAt(20, 2);
        painter.paint(WIDE, noTint, [far, near], [sprite]);

        painter.paint(WIDE, noTint, [far, near], [{...sprite, x: sprite.x + 4}]);

        // The near car, then the sprite over it
        expect(drawn[1].sprites.map(tileOf)).toEqual([{column: 9, row: 8}, {column: 8, row: 8}]);
    });

    it("copies the layer over every device pixel a car's square touches, at a tile size between whole pixels", () => {
        const {painter, drawn} = newPainter();
        // At 17.6 device pixels a tile, a car 1.8 tiles across and down from the origin covers pixels 31.68 to 49.28
        // each way: from the last pixel of the first cell into the second
        const view = {...WIDE, tilePixels: 17.6};
        const car = {...carAt(0, 0), x: (WIDE.origin.x + 1.8) * 16, y: (WIDE.origin.y + 1.8) * 16};
        painter.paint(view, noTint, [car], []);

        painter.paint(view, noTint, [], []);

        expect(covers(drawn[1].composite!, {x: 31, y: 31, width: 19, height: 19})).toBe(true);
    });

    it("draws the map's layer whole when the renderer has made it again, as a canvas sized again makes it", () => {
        const {painter, map, renderer, drawn} = newPainter();
        painter.paint(WIDE, noTint, [], []);
        map.change([{x: WIDE.origin.x + 1, y: WIDE.origin.y + 1, value: ZONE}]);

        renderer.needsWholeLayer = true;

        expect(painter.paint(WIDE, noTint, [], [])).toBe(true);
        expect(drawn[1].areas).toBeNull();
    });

    it("draws all of the view once it forgets the frame drawn last", () => {
        const {painter, drawn} = newPainter();
        painter.paint(WIDE, noTint, [], []);

        painter.invalidate();

        expect(painter.paint(WIDE, noTint, [], [])).toBe(true);
        expect(drawn[1].areas).toBeNull();
    });

    describe("an animated tile", () => {

        beforeEach(() => {
            jest.useFakeTimers({now: new Date(2026, 0, 1)});
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it("moves on to its next frame as time passes, and holds still while the city is paused", () => {
            const {painter} = newPainter({x: 11, y: 6, value: FIRE | ANIMBIT});
            painter.paint(VIEW, noTint, [], [], true);

            jest.advanceTimersByTime(ANIMATION_PERIOD + 1);
            const whilePaused = painter.paint(VIEW, noTint, [], [], true);
            jest.advanceTimersByTime(ANIMATION_PERIOD + 1);
            const running = painter.paint(VIEW, noTint, [], [], false);

            expect([whilePaused, running]).toEqual([false, true]);
        });
    });

    it("draws the whole map offscreen at the tile pixels given, each tile unanimated, and gives back its pixels", () => {
        // An unpowered zone, whose tile would blink on the map's view
        const {painter, renderer, picture} = newPainter({x: 0, y: 0, value: ZONE | ZONEBIT});

        expect(painter.drawWholeMap(16)).toEqual({pixels: picture, width: MAP_WIDTH * 16, height: MAP_HEIGHT * 16});

        expect(renderer.drawOffscreen.mock.calls.map(([frame, width, height]) =>
            [frame.ground.count, width, height])).toEqual([[MAP_WIDTH * MAP_HEIGHT, MAP_WIDTH * 16, MAP_HEIGHT * 16]]);
        const zone = art.tile(ZONE).ground;
        expect(groundOf(renderer.drawOffscreen.mock.calls[0][0])[0]).toEqual({atlas: zone.atlas, x: zone.x, y: zone.y});
    });

    it("lets go of the renderer's context when released", () => {
        const {painter, renderer} = newPainter();

        painter.release();

        expect(renderer.release).toHaveBeenCalledTimes(1);
    });
});
