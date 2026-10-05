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

import { ANIMATION_PERIOD } from "../src/animationManager";
import { ClientMap } from "../src/cityState";
import { MapFrame, QUAD_FLOATS } from "../src/mapFrame";
import { MapPainter } from "../src/mapPainter";
import type { Rect } from "../src/rect";
import { RenderArt, parseRenderManifest } from "../src/renderManifest";
import { ANIMBIT, ZONEBIT } from "../src/tileFlags";
import { FIRE, LIGHTNINGBOLT } from "../src/tileValues";

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
}));

const MAP_WIDTH = 40;
const MAP_HEIGHT = 30;

// A view of 4 by 3 tiles from map tile (10, 5), at 16 device pixels a tile
const VIEW = {origin: {x: 10, y: 5}, across: 4, down: 3, tilePixels: 16};

// A view of 24 by 16 tiles from the same tile, six blocks of tiles, so a change in one of them draws part of the view
const WIDE = {...VIEW, across: 24, down: 16};

// What the renderer was asked to draw: each frame's ground quads, by atlas and where they come from, its sprites, and
// the areas
interface Drawn {
    ground: {atlas: string, x: number, y: number}[];
    sprites: number;
    areas: readonly Rect[] | null;
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
            quads.push({atlas: run.atlas, x: run.floats[i * QUAD_FLOATS + 4], y: run.floats[i * QUAD_FLOATS + 5]});
        }
        return quads;
    });
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
        draw: (frame: MapFrame, areas: readonly Rect[] | null) => {
            drawn.push({ground: groundOf(frame), sprites: frame.sprites.count, areas});
        },
        drawOffscreen: jest.fn<Uint8ClampedArray, [MapFrame, number, number]>(() => picture),
        release: jest.fn(),
    };

    const painter = new MapPainter({width: 64, height: 48}, map, art, renderer);
    return {painter, map, reads, drawn, renderer, picture};
}

const noTint = () => null;

describe("a painter of the map", () => {

    it("reads the tiles in view and a margin around them as wide as the farthest shadow reaches", () => {
        const {painter, reads, drawn} = newPainter();
        const margin = art.shadowReach;

        expect(painter.paint(VIEW, noTint, [])).toBe(true);

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
        const margin = art.shadowReach;

        // Map pixel (168, 84) at 16 a tile: 8 pixels into tile 10 across and 4 into tile 5 down
        painter.paint({...VIEW, origin: {x: 10.5, y: 5.25}}, noTint, []);

        expect(reads.mock.calls.map((call) => call.slice(0, 4))).toEqual([[
            10 - margin, 5 - margin, VIEW.across + 1 + 2 * margin, VIEW.down + 1 + 2 * margin,
        ]]);
        expect(drawn[0].ground).toHaveLength((VIEW.across + 1) * (VIEW.down + 1));
    });

    it("draws the whole view again when its origin moves by a device pixel, and not when it moves by less", () => {
        const {painter, drawn} = newPainter();

        painter.paint(VIEW, noTint, []);
        // A sixty-fourth of a tile is a quarter of a pixel at 16 a tile, which the map is drawn from as no move
        expect(painter.paint({...VIEW, origin: {x: 10 + 1 / 64, y: 5}}, noTint, [])).toBe(false);
        expect(painter.paint({...VIEW, origin: {x: 10 + 1 / 16, y: 5}}, noTint, [])).toBe(true);

        expect(drawn.map((frame) => frame.areas)).toEqual([null, null]);
    });

    it("draws the frame the animation manager picks: an unpowered zone's tile blinks to the lightning bolt", () => {
        const {painter, drawn} = newPainter({x: 10, y: 5, value: ZONE | ZONEBIT});

        painter.paint(VIEW, noTint, []);

        const bolt = art.tile(LIGHTNINGBOLT).ground;
        expect(drawn[0].ground[0]).toEqual({atlas: bolt.atlas, x: bolt.x, y: bolt.y});
    });

    it("draws nothing while the renderer is still drawing the frame before, and is behind until a paint draws", () => {
        const {painter, renderer, drawn} = newPainter();
        renderer.busy = true;

        const whileBusy = painter.paint(VIEW, noTint, []);
        const currentWhileBusy = painter.current;
        renderer.busy = false;
        const currentOnceDone = painter.current;
        const once = painter.paint(VIEW, noTint, []);

        expect([whileBusy, currentWhileBusy, currentOnceDone, once, painter.current])
            .toEqual([false, false, false, true, true]);
        expect(drawn).toHaveLength(1);
    });

    it("draws nothing when nothing changed", () => {
        const {painter, drawn} = newPainter();
        painter.paint(WIDE, noTint, []);

        expect(painter.paint(WIDE, noTint, [])).toBe(false);
        expect(drawn).toHaveLength(1);
    });

    it("draws again only around a tile that changed", () => {
        const {painter, map, drawn} = newPainter();
        painter.paint(WIDE, noTint, []);

        // A tile from the view's origin
        map.change([{x: WIDE.origin.x + 1, y: WIDE.origin.y + 1, value: ZONE}]);

        expect(painter.paint(WIDE, noTint, [])).toBe(true);
        expect(drawn[1].areas).not.toBeNull();
        expect(covers(drawn[1].areas!, {x: 16, y: 16, width: 16, height: 16})).toBe(true);
        expect(covers(drawn[1].areas!, {x: 16 * 20, y: 16 * 12, width: 16, height: 16})).toBe(false);
    });

    it("draws again around a sprite that moved, where it was and where it is, with the sprite", () => {
        const {painter, drawn} = newPainter();
        const sprite = {type: 1, frame: 1, x: (WIDE.origin.x + 1) * 16, y: (WIDE.origin.y + 1) * 16, width: 32};
        painter.paint(WIDE, noTint, [sprite]);

        expect(painter.paint(WIDE, noTint, [{...sprite, x: sprite.x + 16}])).toBe(true);

        expect(drawn.map(({sprites}) => sprites)).toEqual([1, 1]);
        expect(drawn[1].areas).not.toBeNull();
        // Where it was, and where it is, in device pixels from the view's origin
        expect(covers(drawn[1].areas!, {x: 16, y: 16, width: 32, height: 32})).toBe(true);
        expect(covers(drawn[1].areas!, {x: 32, y: 16, width: 32, height: 32})).toBe(true);
    });

    it("draws all of the view once it forgets the frame drawn last", () => {
        const {painter, drawn} = newPainter();
        painter.paint(WIDE, noTint, []);

        painter.invalidate();

        expect(painter.paint(WIDE, noTint, [])).toBe(true);
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
            painter.paint(VIEW, noTint, [], true);

            jest.advanceTimersByTime(ANIMATION_PERIOD + 1);
            const whilePaused = painter.paint(VIEW, noTint, [], true);
            jest.advanceTimersByTime(ANIMATION_PERIOD + 1);
            const running = painter.paint(VIEW, noTint, [], false);

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
