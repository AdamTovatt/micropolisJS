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

import { CAR_COLOURS } from "./cars";
import type { PaintableMover } from "./cars";
import type { Tint } from "./overlayRenderer";
import { SPRITE_PIXELS_PER_TILE } from "./paintable";
import type { PaintableMap, PaintableSprite, PaintableSquare } from "./paintable";
import { NINTHS_PER_SIDE } from "./protocol";
import type { Rect } from "./rect";
import { OWN_SURROUNDS, around, isWoods } from "./surfaces";
import { grassTile } from "./grass";
import { WHITE } from "./renderManifest";
import type { AtlasRect, GrassThrough, RenderArt, SurfaceDraw } from "./renderManifest";
import { BIT_MASK } from "./tileFlags";
import { TILE_INVALID } from "./tileValues";
import { plainRoad } from "./trafficTiles";
import { decksAround, isPaved, pathParts, underAround, walkwaysAround } from "./walkwayDraw";
import { carriageway, kindNinths } from "./walkwayValues";
import { WALKER_COLOURS } from "./walkers";
import type { PixelPoint } from "./viewPosition";

// What one frame of the map draws, as lists of quads the WebGL renderer draws pass by pass. Building them is pure, so
// what lands where is tested under Node; the renderer only uploads the lists and draws them.

// The floats of a quad: where it lands, in device pixels from the target's top-left (x, y, width, height); where it
// comes from, in its atlas's pixels (x, y, width, height); and the colour its texels are multiplied by, premultiplied
// (r, g, b, a)
export const QUAD_FLOATS = 12;

// The floats of a ground quad: a quad's, then the rectangles of its map tile's tile in the world grass's lush and straw
// sets, in their atlas's pixels (x, y, width, height each), its map tile's position (x, y), what it draws (one of the
// three below) and the woods round it (around in surfaces.ts), then the rectangle of its tile of the canopy, the
// rectangle of its tile of the water, and the water round it, then three floats unused, from which the world grass
// under it, and the canopy and the water over the grass, are drawn (docs/render-assets.md); all zeros for a ground
// that lets no grass through, and the woods, the water and their tiles' rectangles zeros for one that draws neither
export const GROUND_QUAD_FLOATS = 36;

// The floats of a paths quad: where it lands, in device pixels, then the rectangle of its map tile's tile in the world
// grass's straw set, whose strokes its paths are drawn in, in the grass's atlas's pixels, its map tile's position, the
// walkway round it (walkwaysAround in walkwayDraw.ts), its first three rows of the window's bits with its own ninths
// holding a footbridge over them, and then the last two with the ninths beside its edges that go under the road or rail
// over them (underAround in walkwayDraw.ts), so each float holds its bits exactly, and its paths' looks, whether they
// are paving, bit 0, or gravel, its ninths that are a road's carriageway (carriageway in walkwayDraw.ts) from bit 1, and
// its own ninths that go under over them, then the part of the tile it draws, a rectangle of its ninths as pathParts in
// walkwayDraw.ts packs it, then two floats unused
export const PATH_QUAD_FLOATS = 16;

// The window's bits a paths quad's first float of them holds, three rows of five, and its second, two rows
export const WALKWAY_LOW_BITS = 15;
export const WALKWAY_HIGH_BITS = 10;

// The ninths of a tile, the bits a mask of them takes
const NINTHS = NINTHS_PER_SIDE * NINTHS_PER_SIDE;

// What a ground quad draws, so no tile pays for the grass or its ground unless it shows them: its ground alone, opaque;
// the world grass alone, where its ground lets all of it through; or its ground over the grass
export const GROUND_ONLY = 0;
export const GROUND_GRASS_ONLY = 1;
export const GROUND_OVER_GRASS = 2;

// The white atlas's one pixel, which the tints are drawn from
const WHITE_PIXEL: Rect = {x: 0, y: 0, width: 1, height: 1};

// The quads drawn from one atlas, in the order they were added, each floatsPerQuad floats
export abstract class Run {
  data: Float32Array;
  count = 0;

  constructor(public atlas: string, readonly floatsPerQuad: number) {
    this.data = new Float32Array(floatsPerQuad * 64);
  }

  // The floats of the quads added
  get floats(): Float32Array {
    return this.data.subarray(0, this.count * this.floatsPerQuad);
  }

  // Where a new quad's floats start, the buffer grown to hold them
  protected next(): number {
    if ((this.count + 1) * this.floatsPerQuad > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }

    return this.count++ * this.floatsPerQuad;
  }

  // A quad's floats from at: landing at (x, y), width by height device pixels, from the source in the atlas's pixels,
  // its texels multiplied by the colour
  protected place(at: number, x: number, y: number, width: number, height: number, source: Rect, r: number,
                  g: number, b: number, a: number): void {
    const data = this.data;
    data[at] = x;
    data[at + 1] = y;
    data[at + 2] = width;
    data[at + 3] = height;
    data[at + 4] = source.x;
    data[at + 5] = source.y;
    data[at + 6] = source.width;
    data[at + 7] = source.height;
    data[at + 8] = r;
    data[at + 9] = g;
    data[at + 10] = b;
    data[at + 11] = a;
  }
}

// A run of quads, QUAD_FLOATS each
export class QuadRun extends Run {
  constructor(atlas: string) {
    super(atlas, QUAD_FLOATS);
  }

  // A quad landing at (x, y), width by height device pixels, from the source in the atlas's pixels, its texels
  // multiplied by the colour
  add(x: number, y: number, width: number, height: number, source: Rect, r: number, g: number, b: number,
      a: number): void {
    this.place(this.next(), x, y, width, height, source, r, g, b, a);
  }
}

// A run of ground quads, GROUND_QUAD_FLOATS each
export class GroundRun extends Run {
  constructor(atlas: string) {
    super(atlas, GROUND_QUAD_FLOATS);
  }

  // A ground quad landing at (x, y), width by height device pixels, from the source in the atlas's pixels, over the
  // world grass of the map tile at (mapX, mapY), whose tiles in the lush and straw sets are the rectangles given, as
  // much as its ground lets through, or opaque over none for null
  addGround(x: number, y: number, width: number, height: number, source: Rect, grass: GroundSurfaces | null): void {
    const start = this.next();
    this.place(start, x, y, width, height, source, 1, 1, 1, 1);
    const data = this.data;
    const at = start + QUAD_FLOATS;
    if (grass === null) {
      data.fill(0, at, at + GROUND_QUAD_FLOATS - QUAD_FLOATS);
      return;
    }

    const {lush, straw, mapX, mapY, canopy, water} = grass;
    rectangle(data, at, lush);
    rectangle(data, at + 4, straw);
    data[at + 8] = mapX;
    data[at + 9] = mapY;
    data[at + 10] = drawn(grass);
    data[at + 11] = canopy?.woods ?? 0;
    rectangle(data, at + 12, canopy?.tile ?? null);
    rectangle(data, at + 16, water?.tile ?? null);
    data[at + 20] = water?.water ?? 0;
    data.fill(0, at + 21, at + GROUND_QUAD_FLOATS - QUAD_FLOATS);
  }
}

// A run of paths quads, PATH_QUAD_FLOATS each
export class PathRun extends Run {
  constructor(atlas: string) {
    super(atlas, PATH_QUAD_FLOATS);
  }

  // The paths over the part of the map tile at (mapX, mapY) given (pathParts in walkwayDraw.ts), the tile landing at
  // (x, y), width by height device pixels, drawn in the strokes of its tile in the world grass's straw set, the
  // rectangle given
  addPaths(x: number, y: number, width: number, height: number, straw: Rect, mapX: number, mapY: number,
           paths: TilePaths, part: number): void {
    const at = this.next();
    const data = this.data;
    data[at] = x;
    data[at + 1] = y;
    data[at + 2] = width;
    data[at + 3] = height;
    rectangle(data, at + 4, straw);
    data[at + 8] = mapX;
    data[at + 9] = mapY;
    data[at + 10] = (paths.around & ((1 << WALKWAY_LOW_BITS) - 1)) | (paths.footbridge << WALKWAY_LOW_BITS);
    data[at + 11] = (paths.around >> WALKWAY_LOW_BITS) | (paths.underRing << WALKWAY_HIGH_BITS);
    data[at + 12] = (paths.paved ? 1 : 0) | (paths.carriageway << 1) | (paths.under << (1 + NINTHS));
    data[at + 13] = part;
    data.fill(0, at + 14, at + PATH_QUAD_FLOATS);
  }
}

// A rectangle's floats from at, x, y, width and height, or zeros for none
function rectangle(data: Float32Array, at: number, rect: Rect | null): void {
  data[at] = rect?.x ?? 0;
  data[at + 1] = rect?.y ?? 0;
  data[at + 2] = rect?.width ?? 0;
  data[at + 3] = rect?.height ?? 0;
}

// The floats of a surface shadow's quad: where it lands, in device pixels, and the rectangle of its map tile's ground
// in its atlas, as a quad's; then the map tile's position, the woods round it (around in surfaces.ts) and what its
// ground draws (as a ground quad does); then the water round it, the footbridges' decks round it and those of them
// that run down (decksAround in walkwayDraw.ts), and one float unused. The canopy's shadow falls on whatever shows of
// the tile but the canopy, which the ground's own pixels and the water and the sand over the grass hide, and a deck's
// on whatever shows of it but the decks.
export const SURFACE_SHADOW_QUAD_FLOATS = 16;

// A run of surface shadow quads over grounds from one atlas, SURFACE_SHADOW_QUAD_FLOATS each
export class SurfaceShadowRun extends Run {
  constructor(atlas: string) {
    super(atlas, SURFACE_SHADOW_QUAD_FLOATS);
  }

  // The shadows over the map tile at (mapX, mapY), with the woods and the decks round it, whose quad lands at (x, y),
  // width by height device pixels, over its ground, from the source in the atlas's pixels, and the world grass, the
  // canopy and the water under that, or null for a ground that lets no grass through
  addShadow(x: number, y: number, width: number, height: number, source: Rect, mapX: number, mapY: number,
            woods: number, surfaces: GroundSurfaces | null, decks: Decks): void {
    const at = this.next();
    const data = this.data;
    data[at] = x;
    data[at + 1] = y;
    data[at + 2] = width;
    data[at + 3] = height;
    rectangle(data, at + 4, source);
    data[at + 8] = mapX;
    data[at + 9] = mapY;
    data[at + 10] = woods;
    data[at + 11] = drawn(surfaces);
    data[at + 12] = surfaces?.water?.water ?? 0;
    data[at + 13] = decks.decks;
    data[at + 14] = decks.runsDown;
    data[at + 15] = 0;
  }
}

// The footbridges' decks round a map tile, as decksAround in walkwayDraw.ts finds them
export interface Decks {
  decks: number;
  runsDown: number;
}

// No decks round a map tile
const NO_DECKS: Decks = {decks: 0, runsDown: 0};

// What a ground quad over the surfaces given draws: its ground alone for none
function drawn(surfaces: GroundSurfaces | null): number {
  if (surfaces === null) {
    return GROUND_ONLY;
  }
  return surfaces.through === "all" ? GROUND_GRASS_ONLY : GROUND_OVER_GRASS;
}

// The world grass under a map tile: its tile's rectangle in each set, the map tile's position, how much of it the
// ground lets through, and the canopy and the water over the grass there, or null for none
export interface GroundSurfaces {
  lush: Rect;
  straw: Rect;
  through: GrassThrough;
  mapX: number;
  mapY: number;
  canopy: CanopyTile | null;
  water: WaterTile | null;
}

// The paths over a map tile: the walkway round it (walkwaysAround in walkwayDraw.ts), never 0, whether they are
// paving, its ninths that are a road's carriageway, those of its own ninths that hold a footbridge and those that go
// under the road or rail, each a bit 1 << n for ninth n, and the ninths beside its edges that go under (underAround in
// walkwayDraw.ts)
export interface TilePaths {
  around: number;
  paved: boolean;
  carriageway: number;
  footbridge: number;
  under: number;
  underRing: number;
}

// The canopy over a map tile: its tile's rectangle, and the woods round the map tile it is drawn from (around in
// surfaces.ts), never 0
export interface CanopyTile {
  tile: Rect;
  woods: number;
}

// The water over a map tile: its tile's rectangle, and the water round the map tile it is drawn from, never 0
export interface WaterTile {
  tile: Rect;
  water: number;
}

// A pass's quads, grouped into runs by atlas. In an ordered list, where quads overlap, each run is drawn in the order
// its quads were added, and a new run starts each time the atlas changes. In an unordered one, whose quads never
// overlap or merge in an order that doesn't matter, each atlas has one run, so the pass is one draw per atlas. Runs
// are kept from frame to frame, so their buffers grow once.
export abstract class RunList<R extends Run> {
  private readonly kept: R[] = [];
  private used = 0;

  constructor(private readonly ordered: boolean) {}

  // The runs added since the last clear, in the order they are drawn
  get runs(): readonly R[] {
    return this.kept.slice(0, this.used);
  }

  // The number of quads added since the last clear
  get count(): number {
    let count = 0;
    for (let i = 0; i < this.used; i++) {
      count += this.kept[i].count;
    }
    return count;
  }

  clear(): void {
    for (const run of this.kept) {
      run.count = 0;
    }
    this.used = 0;
  }

  // A new run of the atlas
  protected abstract newRun(atlas: string): R;

  // The run a quad from the atlas is added to
  protected runFor(atlas: string): R {
    if (this.ordered) {
      const last = this.used > 0 ? this.kept[this.used - 1] : null;
      if (last !== null && last.atlas === atlas) {
        return last;
      }
    } else {
      for (let i = 0; i < this.used; i++) {
        if (this.kept[i].atlas === atlas) {
          return this.kept[i];
        }
      }
    }

    // A kept run, perhaps of another atlas last frame, is reused under this one's name
    if (this.used === this.kept.length) {
      this.kept.push(this.newRun(atlas));
    } else {
      this.kept[this.used].atlas = atlas;
    }

    return this.kept[this.used++];
  }
}

// A pass's quads, as RunList groups them
export class QuadList extends RunList<QuadRun> {
  // A quad from the atlas, as QuadRun's add takes it, opaque unless a colour is given
  add(atlas: string, x: number, y: number, width: number, height: number, source: Rect, r = 1, g = 1, b = 1,
      a = 1): void {
    this.runFor(atlas).add(x, y, width, height, source, r, g, b, a);
  }

  protected newRun(atlas: string): QuadRun {
    return new QuadRun(atlas);
  }
}

// The ground pass's quads, unordered, as RunList groups them
export class GroundList extends RunList<GroundRun> {
  constructor() {
    super(false);
  }

  // A ground quad from the atlas, as GroundRun's addGround takes it
  addGround(atlas: string, x: number, y: number, width: number, height: number, source: Rect,
            grass: GroundSurfaces | null): void {
    this.runFor(atlas).addGround(x, y, width, height, source, grass);
  }

  protected newRun(atlas: string): GroundRun {
    return new GroundRun(atlas);
  }
}

// The paths pass's quads, unordered, since no two overlap, as RunList groups them by the grass's atlas they are drawn
// from
export class PathList extends RunList<PathRun> {
  constructor() {
    super(false);
  }

  // A paths quad drawn from the grass's atlas, as PathRun's addPaths takes it
  addPaths(atlas: string, x: number, y: number, width: number, height: number, straw: Rect, mapX: number,
           mapY: number, paths: TilePaths, part: number): void {
    this.runFor(atlas).addPaths(x, y, width, height, straw, mapX, mapY, paths, part);
  }

  protected newRun(atlas: string): PathRun {
    return new PathRun(atlas);
  }
}

// The surfaces' shadows' quads, the canopy's and the decks', unordered, merged by the darkest, as RunList groups them
// by their grounds' atlases
export class SurfaceShadowList extends RunList<SurfaceShadowRun> {
  constructor() {
    super(false);
  }

  // A surface shadow's quad over a ground from the atlas, as SurfaceShadowRun's addShadow takes it
  addShadow(atlas: string, x: number, y: number, width: number, height: number, source: Rect, mapX: number,
            mapY: number, woods: number, surfaces: GroundSurfaces | null, decks: Decks): void {
    this.runFor(atlas).addShadow(x, y, width, height, source, mapX, mapY, woods, surfaces, decks);
  }

  protected newRun(atlas: string): SurfaceShadowRun {
    return new SurfaceShadowRun(atlas);
  }
}

// The quads of each pass: every tile's ground, over the world grass, and the paths over the tiles with walkway in or
// round them; every anchor's shadow, and the canopy's and the footbridges' decks' over each tile with woods or decks
// about it, merged by the darkest; every tile's objects; the overlay's tints, over the objects; then the sprites. With
// what the world grass is drawn with, and the mip level the frame's zoom samples every grass tile at, whose one size on
// screen it fixes; null until the frame is first built, when it has no ground either.
export class MapFrame {
  readonly ground = new GroundList();
  readonly paths = new PathList();
  surfaces: SurfaceDraw | null = null;
  grassLevel = 0;
  readonly shadows = new QuadList(false);
  readonly surfaceShadows = new SurfaceShadowList();
  readonly objects = new QuadList(false);
  readonly tints = new QuadList(false);
  readonly sprites = new QuadList(true);

  // Whether the frame casts any shadow
  get hasShadows(): boolean {
    return this.shadows.count > 0 || this.surfaceShadows.count > 0;
  }

  clear(): void {
    this.ground.clear();
    this.paths.clear();
    this.shadows.clear();
    this.surfaceShadows.clear();
    this.objects.clear();
    this.tints.clear();
    this.sprites.clear();
  }
}

// The tiles a frame reads: an area of the map margin tiles wider on every side than the view, from map tile (x, y),
// width by height tiles, row by row. offset is how far, in device pixels, the view's top-left lies right of and below
// the top-left of the first tile in view, margin tiles in from the area's: the view's origin may lie between tiles.
// values are the tiles' raw values, TILE_INVALID off the map, frames are the tile ids to draw, as the animation
// manager chose them from the values, and walkways are the tiles' walkway values, 0 off the map.
export interface FrameTiles {
  x: number;
  y: number;
  width: number;
  height: number;
  margin: number;
  offset: PixelPoint;
  values: readonly number[];
  frames: readonly number[];
  walkways: readonly number[];
}

// What a frame reads of the whole map
export type WholeMap = Pick<PaintableMap, "width" | "height" | "getTileValuesForPainting" | "getWalkwaysForPainting">;

// The whole map as a frame reads it, with no margin, since no tile lies past the map's edges: each tile's own value,
// unanimated
export function wholeMapTiles(map: WholeMap): FrameTiles {
  const {width, height} = map;
  const values = map.getTileValuesForPainting(0, 0, width, height, []);
  return {x: 0, y: 0, width, height, margin: 0, offset: {x: 0, y: 0}, values,
          frames: values.map((value) => value & BIT_MASK),
          walkways: map.getWalkwaysForPainting(0, 0, width, height, [])};
}

// Fills the frame with the quads that draw the whole map, tilePixels device pixels a tile, each tile's own value
// unanimated, with no tints, cars or sprites
export function buildWholeMapFrame(frame: MapFrame, art: RenderArt, map: WholeMap, tilePixels: number): void {
  buildMapFrame(frame, art, wholeMapTiles(map), tilePixels, () => null, [], []);
}

// The share of a car's square a car with no art fills along the way it faces, and across it, centred: the size of the
// painted car in its frame
export const CAR_LENGTH = 17 / 64;
export const CAR_BREADTH = 7 / 64;

// Adds the quad that draws what moves over the map whose square lands at (x, y), side device pixels a side, filling the
// square: a carriage of a train from the trains' art, which the 16 px sprite sheet always has, a car on the road from
// its colour's art, or where the art has none, as a rectangle in its flat colour, long the way it faces, and a walker
// as its dab of paint tinted its colour
function addMover(list: QuadList, art: RenderArt, car: PaintableMover, x: number, y: number, side: number): void {
  if (car.kind === "rail") {
    const train = art.trainCar(car.direction);
    list.add(train.atlas, x, y, side, side, train);
    return;
  }
  if (car.kind === "walker") {
    const [r, g, b] = WALKER_COLOURS[car.colour].flat;
    const dab = art.walkerDab(car.dab);
    list.add(dab.atlas, x, y, side, side, dab, r, g, b, 1);
    return;
  }

  // A car fading out shows as much of itself as its opacity, its tint premultiplied as the renderer's colours are
  const a = car.opacity;
  const rect = art.car(car.colour, car.direction);
  if (rect !== null) {
    list.add(rect.atlas, x, y, side, side, rect, a, a, a, a);
    return;
  }

  const along = side * CAR_LENGTH;
  const across = side * CAR_BREADTH;
  const [r, g, b] = CAR_COLOURS[car.colour].flat;
  if (car.direction === "east" || car.direction === "west") {
    list.add(WHITE, x + (side - along) / 2, y + (side - across) / 2, along, across, WHITE_PIXEL, r * a, g * a, b * a, a);
  } else {
    list.add(WHITE, x + (side - across) / 2, y + (side - along) / 2, across, along, WHITE_PIXEL, r * a, g * a, b * a, a);
  }
}

// Fills the frame with the quads that draw the area's tiles, tilePixels device pixels a side, with the view's top-left
// the area's offset into its first tile in view; then the tints of the tiles in view; then the cars, carriages and
// walkers given, then the sprites, over them. Given areas of the view, in device pixels from its top-left, only the
// tiles' and the tints' quads that reach into one are added, none for no areas: the renderer draws the map no further
// than they reach. Without, every quad is. What moves and the sprites are added whole either way: they are drawn over
// the whole map.
//
// A shadow comes from its anchor's raw value, not from the frame the animation manager chose: an unpowered zone's centre
// blinks to the lightning bolt, and its shadow would blink with it. Every layer of a traffic tile, its shadow included,
// comes from the plain road it runs on (trafficTiles.ts): the cars are the traffic. This is the one place the map, the
// monster TV and the preview alike look up a tile's art.
export function buildMapFrame(frame: MapFrame, art: RenderArt, tiles: FrameTiles, tilePixels: number,
                              tint: (x: number, y: number) => Tint | null, movers: readonly PaintableMover[],
                              sprites: readonly PaintableSprite[], areas: readonly Rect[] | null = null): void {
  frame.clear();
  const {margin, width, height, offset} = tiles;
  const grass = art.grass;
  frame.surfaces = art.surfaceDraw;
  // The level whose texels are a device pixel each, or the first where the grass is drawn larger than its art
  frame.grassLevel = Math.max(0, Math.log2(grass.texels / tilePixels));

  // Whether a quad landing at (x, y), width by height device pixels, reaches into an area
  const reaches = (x: number, y: number, quadWidth: number, quadHeight: number) => areas === null ||
    areas.some((area) => x < area.x + area.width && x + quadWidth > area.x && y < area.y + area.height &&
                         y + quadHeight > area.y);

  // No areas draw none of the map
  const drawsMap = areas === null || areas.length > 0;
  for (let row = 0; drawsMap && row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = row * width + column;
      const value = tiles.values[index];
      if (value === TILE_INVALID) {
        continue;
      }

      // From the view's top-left, in device pixels
      const x = (column - margin) * tilePixels - offset.x;
      const y = (row - margin) * tilePixels - offset.y;

      const shadow = art.tile(plainRoad(value & BIT_MASK)).shadow;
      if (shadow !== null) {
        const {left, top, right, bottom} = shadow.reach;
        const shadowX = x - left * tilePixels;
        const shadowY = y - top * tilePixels;
        const shadowWidth = (left + 1 + right) * tilePixels;
        const shadowHeight = (top + 1 + bottom) * tilePixels;
        if (reaches(shadowX, shadowY, shadowWidth, shadowHeight)) {
          frame.shadows.add(shadow.atlas, shadowX, shadowY, shadowWidth, shadowHeight, shadow);
        }
      }

      const inView = column >= margin && column < width - margin && row >= margin && row < height - margin;
      if (!inView || !reaches(x, y, tilePixels, tilePixels)) {
        continue;
      }

      const tileArt = art.tile(plainRoad(tiles.frames[index]));
      const mapX = tiles.x + column;
      const mapY = tiles.y + row;
      const woods = around(tiles, column, row, isWoods);
      // The world grass under a ground that lets any through, and the canopy and the water over it where woods and
      // water lie round it, so they run on under every ground that lets the grass through and end nowhere on a tile's
      // edge
      const picked = grassTile(mapX, mapY, grass.constants);
      let under: GroundSurfaces | null = null;
      if (tileArt.grass !== null) {
        const water = around(tiles, column, row, art.isWater) & OWN_SURROUNDS;
        under = {lush: grass.lush.tiles[picked], straw: grass.straw.tiles[picked], mapX, mapY,
                 through: tileArt.grass,
                 canopy: (woods & OWN_SURROUNDS) === 0 ? null : {tile: art.canopyTile(mapX, mapY), woods},
                 water: water === 0 ? null : {tile: art.waterTile(mapX, mapY), water}};
      }
      frame.ground.addGround(tileArt.ground.atlas, x, y, tilePixels, tilePixels, tileArt.ground, under);
      // The paths over the ground, in a pass of their own over the parts of the tiles with walkway in or round them
      // they can show on, drawn in the straw's strokes: each keeps within its own ninths, which those round it join it
      // to, but for rounding into the inside of a turn, which at a tile's corner lies in a tile with none of its own
      const walkways = walkwaysAround(tiles, column, row);
      let decks: Decks = NO_DECKS;
      if (walkways !== 0) {
        const id = plainRoad(tiles.values[index] & BIT_MASK);
        const {own, ring} = underAround(tiles, (at) => plainRoad(tiles.values[at] & BIT_MASK), column, row);
        const paths = {around: walkways, paved: isPaved(id), carriageway: carriageway(id),
                       footbridge: kindNinths(tiles.walkways[index], "footbridge"), under: own, underRing: ring};
        for (const part of pathParts(walkways, own)) {
          frame.paths.addPaths(grass.atlas, x, y, tilePixels, tilePixels, grass.straw.tiles[picked], mapX, mapY, paths,
                               part);
        }
        decks = decksAround(tiles, column, row);
      }
      // The canopy's shadow over the tile, cast from the canopy up and left of it, and the decks', cast from the decks
      // up and left of each point, onto whatever the tile's ground is
      if (woods !== 0 || decks.decks !== 0) {
        frame.surfaceShadows.addShadow(tileArt.ground.atlas, x, y, tilePixels, tilePixels, tileArt.ground, mapX, mapY,
                                       woods, under, decks);
      }
      if (tileArt.objects !== null) {
        frame.objects.add(tileArt.objects.atlas, x, y, tilePixels, tilePixels, tileArt.objects);
      }

      const colour = tint(tiles.x + column, tiles.y + row);
      if (colour !== null) {
        const {r, g, b, a} = colour;
        frame.tints.add(WHITE, x, y, tilePixels, tilePixels, WHITE_PIXEL, r / 255 * a, g / 255 * a, b / 255 * a, a);
      }
    }
  }

  for (const mover of movers) {
    const {x, y, side} = squareOnView(mover, tiles, tilePixels);
    addMover(frame.sprites, art, mover, x, y, side);
  }

  for (const sprite of sprites) {
    const rect = spriteArt(art, sprite.type, sprite.frame);
    const {x, y, side} = squareOnView(sprite, tiles, tilePixels);
    frame.sprites.add(rect.atlas, x, y, side, side, rect);
  }
}

// The art of a sprite's type and frame, failing on one no art draws
function spriteArt(art: RenderArt, type: number, frame: number): AtlasRect {
  const rect = art.sprite(type, frame);
  if (rect === null) {
    throw new Error(`No art draws sprite ${type} frame ${frame}`);
  }
  return rect;
}

// Where the square of a car or a sprite lands on the view the tiles are read for, tilePixels device pixels a tile: its
// top-left, from the view's top-left, and its side, in device pixels, which may fall between pixels
export function squareOnView(square: PaintableSquare, tiles: Pick<FrameTiles, "x" | "y" | "margin" | "offset">,
                             tilePixels: number): {x: number, y: number, side: number} {
  // The first tile in view's top-left, in map pixels
  const firstX = (tiles.x + tiles.margin) * SPRITE_PIXELS_PER_TILE;
  const firstY = (tiles.y + tiles.margin) * SPRITE_PIXELS_PER_TILE;
  const scale = tilePixels / SPRITE_PIXELS_PER_TILE;
  return {x: (square.x - firstX) * scale - tiles.offset.x, y: (square.y - firstY) * scale - tiles.offset.y,
          side: square.width * scale};
}
