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

import { GameCanvas } from "../src/gameCanvas";
import type { MapFrame } from "../src/mapFrame";
import { OverlaySelection } from "../src/overlayPicker";
import { rampColour } from "../src/overlayRenderer";
import type { PaintableMap } from "../src/paintable";
import type { OverlayAnswer, OverlayLayer } from "../src/protocol";
import type { Rect } from "../src/rect";
import { RenderArt, parseRenderManifest } from "../src/renderManifest";
import { DIRT, RIVER, TILE_INVALID } from "../src/tileValues";
import { FakeOverlaySource } from "./helpers/fakeOverlaySource";
import { plainCanopy, plainGrass, plainWater } from "./helpers/grassArt";

// The legend names the layer whose tint the map shows. The game canvas draws no frame while the GPU is still drawing
// the one before, so a new overlay shows some frames after it is set: until then, the legend stays on the layer the
// map was drawn with. The canvas paints here as in the page, over a renderer double the test makes busy, and a DOM
// stubbed as far as the canvas reads one; the overlay picker wires the selection and the legend to it as here. The
// same canvas is the one place to see how often it draws the map's layer whole, which the render benchmark asks of it.

interface RendererDouble {
    busy: boolean;
    // The tint of each frame drawn: the colour of its first tint quad, as the frame gives it, or null for none
    readonly draws: (number[] | null)[];
    // The areas of the map's layer each frame drew again, null for all of it
    readonly layers: (readonly Rect[] | null)[];
}

const mockRenderers: RendererDouble[] = [];

// Where a quad's colour starts among its floats, after where it lands and where it comes from (mapFrame.ts), and the
// floats it takes, red, green, blue and alpha
const mockColourAt = 8;
const mockColourFloats = 4;

jest.mock("../src/webglRenderer", () => ({
    WebGLRenderer: class {
        busy = false;
        readonly draws: (number[] | null)[] = [];
        readonly layers: (readonly Rect[] | null)[] = [];

        constructor() {
            mockRenderers.push(this);
        }

        draw(frame: MapFrame, areas: readonly Rect[] | null): void {
            const run = frame.tints.runs[0];
            this.draws.push(run === undefined ? null :
                Array.from(run.floats.slice(mockColourAt, mockColourAt + mockColourFloats)));
            this.layers.push(areas);
        }
    },
}));

const MAP_WIDTH = 40;
const MAP_HEIGHT = 30;
const CONTAINER = "container";

// An answer tinting the whole map, every block of it 1, so every tile has the one tint its layer gives that value
function wholeMapAnswer(layer: OverlayLayer): OverlayAnswer {
    const width = MAP_WIDTH / 8;
    const height = Math.ceil(MAP_HEIGHT / 8);
    return {type: "overlay", layer, blockSize: 8, width, height, low: 0, high: 1, values: Array(width * height).fill(1)};
}

const FIRE = wholeMapAnswer("fireCoverage");
const POWER = wholeMapAnswer("powerGrid");

// The tint an answer's frame gives its quads: premultiplied, as floats
function quadTint(answer: OverlayAnswer): number[] {
    const {r, g, b, a} = rampColour(answer, answer.values[0])!;
    return Array.from(new Float32Array([r / 255 * a, g / 255 * a, b / 255 * a, a]));
}

// Every tile on the map is the one tile value
let tileValue = DIRT;

const map: PaintableMap = {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    testBounds: (x, y) => x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT,
    getTileValue: () => tileValue,
    getTileValuesForPainting(x, y, w, h, result) {
        result.length = w * h;
        for (let i = 0; i < w * h; i++) {
            result[i] = map.testBounds(x + i % w, y + Math.floor(i / w)) ? tileValue : TILE_INVALID;
        }
        return result;
    },
};

type Globals = {HTMLElement?: unknown, document?: unknown, window?: unknown};

function fakeCanvas() {
    return {id: "", width: 0, height: 0, style: {}, parentNode: null as unknown,
            getContext: () => ({setTransform: () => undefined, clearRect: () => undefined})};
}

beforeAll(() => {
    class FakeElement {}
    const container = Object.assign(new FakeElement(), {
        clientWidth: 320, clientHeight: 240, firstChild: null,
        insertBefore(child: {parentNode: unknown}) {
            child.parentNode = container;
        },
    });
    const globals = globalThis as Globals;
    globals.HTMLElement = FakeElement;
    globals.document = {
        getElementById: (id: string) => id === CONTAINER ? container : null,
        createElement: () => fakeCanvas(),
    };
    globals.window = {devicePixelRatio: 1, addEventListener: () => undefined};
});

afterAll(() => {
    const globals = globalThis as Globals;
    delete globals.HTMLElement;
    delete globals.document;
    delete globals.window;
});

describe("the overlay's legend", () => {

    let canvas: GameCanvas;
    let renderer: RendererDouble;
    let source: FakeOverlaySource;
    let overlays: OverlaySelection;
    // The layer of each legend shown, null for none
    let legend: (OverlayLayer | null)[];

    const paint = () => canvas.paint([], [], []);
    const lastDraw = () => renderer.draws[renderer.draws.length - 1];

    // Chooses the layer, answers for it and paints
    function show(answer: OverlayAnswer): void {
        overlays.select(answer.layer);
        source.answer(answer);
        paint();
    }

    beforeEach(() => {
        tileValue = DIRT;
        const art = new RenderArt(parseRenderManifest({
            version: 1, atlases: {grass: "grass.png"}, tiles: {}, sprites: {}, cars: {},
            grass: plainGrass({atlas: "grass", x: 0, y: 0, width: 16, height: 16}),
            canopy: plainCanopy({atlas: "grass", x: 0, y: 0, width: 16, height: 16}),
            water: plainWater({atlas: "grass", x: 0, y: 0, width: 16, height: 16}),
        }));
        canvas = new GameCanvas(CONTAINER, map, {art, atlases: new Map()});
        renderer = mockRenderers[mockRenderers.length - 1];
        source = new FakeOverlaySource();
        overlays = new OverlaySelection(source, (view) => canvas.setOverlay(view));
        legend = [];
        canvas.onOverlayDrawn((view) => legend.push(view?.answer.layer ?? null));
    });

    it("names a layer only once the map is drawn with its tint", () => {
        overlays.select("fireCoverage");
        source.answer(FIRE);
        expect(legend).toEqual([]);

        paint();

        expect([legend, lastDraw()]).toEqual([["fireCoverage"], quadTint(FIRE)]);
    });

    it("stays on the layer drawn while the renderer is busy, the map still showing its tint", () => {
        show(FIRE);
        const draws = renderer.draws.length;

        renderer.busy = true;
        overlays.select("powerGrid");
        source.answer(POWER);
        paint();
        paint();

        expect([legend, renderer.draws.length, lastDraw()]).toEqual([["fireCoverage"], draws, quadTint(FIRE)]);
    });

    it("follows the new layer once its tint is drawn", () => {
        show(FIRE);
        renderer.busy = true;
        overlays.select("powerGrid");
        source.answer(POWER);
        paint();

        renderer.busy = false;
        paint();

        expect([legend, lastDraw()]).toEqual([["fireCoverage", "powerGrid"], quadTint(POWER)]);
    });

    it("goes once the map is drawn without a tint", () => {
        show(FIRE);
        renderer.busy = true;
        overlays.select(null);
        paint();
        expect(legend).toEqual(["fireCoverage"]);

        renderer.busy = false;
        paint();

        expect([legend, lastDraw()]).toEqual([["fireCoverage", null], null]);
    });

    it("isn't told again when a frame draws only a changed tile under the same overlay", () => {
        show(FIRE);
        const draws = renderer.draws.length;

        tileValue = RIVER;
        paint();

        expect([legend, renderer.draws.length]).toEqual([["fireCoverage"], draws + 1]);
    });

    // For the render benchmark, which times the drawing of the map itself (testHook.ts)
    it("has the map's layer drawn whole on every paint while asked, and only where it changed after", () => {
        paint();
        paint();
        const still = renderer.layers.length;

        canvas.wholeLayerEachFrame = true;
        paint();
        paint();
        canvas.wholeLayerEachFrame = false;
        paint();

        // The first paint draws all of the view; a still map then draws nothing until asked, and nothing once not
        expect([still, renderer.layers]).toEqual([1, [null, null, null]]);
    });
});
