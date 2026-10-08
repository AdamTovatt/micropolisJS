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
import { GRASS_MAP } from "./grass";
import type { GrassConstants, NoiseOctave, TurnedOctave } from "./grass";
import { CAR_DIRECTIONS } from "./routeTiles";
import type { CarDirection } from "./routeTiles";
import type { Rect } from "./rect";
import { tileImageOrigin } from "./tileSet";
import { TILE_COUNT } from "./tileValues";

// The art the map is drawn with: which rectangle of which atlas each tile id draws in each layer, and each sprite type
// and frame. docs/render-assets.md specifies the manifest's file, which the rendered art comes in; a tile id or sprite
// frame the rendered art leaves out is drawn from the fallback manifest, which this module generates from the 16 px
// sheets the game has always drawn with, and a car it leaves out in its flat colour.

// A rectangle of an atlas, in the atlas's pixels
export interface AtlasRect extends Rect {
  atlas: string;
}

// The whole tiles a shadow reaches past its anchor tile on each side
export interface Reach {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// A shadow, drawn whole from its anchor tile over the anchor and the tiles it reaches past it
export interface ShadowRect extends AtlasRect {
  reach: Reach;
}

// What a tile id draws: its ground, the shadow it casts if it is its asset's anchor, and its objects. Ground and
// objects fill the tile exactly.
export interface TileArt {
  ground: AtlasRect;
  shadow: ShadowRect | null;
  objects: AtlasRect | null;
  // How much of the ground lets the world grass through: all of it, so only the grass is drawn, part of it, or none,
  // null, so only the ground is
  grass: GrassThrough | null;
}

export type GrassThrough = "all" | "part";

// One set of the world grass's corner tiles: each tile's rectangle, by the number grassTile gives it, and the set's
// mean colour, red, green and blue from 0 to 255
export interface GrassSet {
  tiles: readonly AtlasRect[];
  mean: readonly [number, number, number];
}

// The world grass bare land is drawn with: its two sets, lush and straw, all of whose tiles are in one atlas and are
// squares texels pixels a side, and what picks a tile and mixes the sets at each map position
export interface GrassArt {
  constants: GrassConstants;
  atlas: string;
  texels: number;
  lush: GrassSet;
  straw: GrassSet;
}

// A manifest: each atlas's image, by name, a path relative to the manifest's own, and the art of each tile id, of each
// sprite, by type and frame, as spriteKey names it, and of each car, by colour and direction, as carKey names it, and
// the world grass
export interface RenderManifest {
  atlases: ReadonlyMap<string, string>;
  tiles: ReadonlyMap<number, TileArt>;
  sprites: ReadonlyMap<string, AtlasRect>;
  cars: ReadonlyMap<string, AtlasRect>;
  grass: GrassArt;
}

// What the renderer draws the world grass with, the same at every zoom: the atlas of its sets and the baked field, by
// name, each set's mean colour and the tint's constants, colours from 0 to 1, and the map's size in tiles, which the
// field covers
export interface GrassDraw {
  atlas: string;
  field: string;
  lushMean: readonly [number, number, number];
  strawMean: readonly [number, number, number];
  warm: readonly [number, number, number];
  brightness: number;
  warmth: number;
  fieldTiles: {width: number, height: number};
}

// The key of a car's art in a manifest's cars, from its colour's name and the way it faces
export function carKey(colour: string, direction: CarDirection): string {
  return `${colour}/${direction}`;
}

// Atlas names starting with this are the client's own, and a manifest's atlases may not take one: the fallback sheets',
// and the white pixel the overlay's tints are drawn from
const RESERVED_ATLAS_PREFIX = "fallback:";
export const FALLBACK_TILES = `${RESERVED_ATLAS_PREFIX}tiles`;
export const FALLBACK_SPRITES = `${RESERVED_ATLAS_PREFIX}sprites`;
export const WHITE = `${RESERVED_ATLAS_PREFIX}white`;
// The world grass's field of straw share and tint, which the client bakes from the manifest's grass section
export const GRASS_FIELD = `${RESERVED_ATLAS_PREFIX}grass-field`;

const FALLBACK_TILE_PIXELS = 16;

// The sprite sheet: a 48 px cell per frame, a row per type in the order of the types' numbers, a column per frame. Each
// type's frames and the pixels a side of its square, which the simulation's sprite modules state for themselves, and
// test/renderManifest.ts checks these against.
const SPRITE_CELL = 48;
export const SPRITE_SHEET: ReadonlyArray<{frames: number, width: number}> = [
  {frames: 5, width: 32}, // train
  {frames: 8, width: 32}, // helicopter
  {frames: 11, width: 48}, // airplane
  {frames: 8, width: 48}, // ship
  {frames: 16, width: 48}, // monster
  {frames: 3, width: 48}, // tornado
  {frames: 6, width: 48}, // explosion
];

// The sprite sheet's row of the trains' art
const TRAIN_SPRITE_TYPE = 1;

// The key of a sprite's art in a manifest's sprites, from its type and frame, which count from 1
export function spriteKey(type: number, frame: number): string {
  return `${type}/${frame}`;
}

// A sprite frame's cell of images/sprites.png, or null for a type or frame the sheet has no cell for
export function fallbackSpriteRect(type: number, frame: number): AtlasRect | null {
  const sheet = SPRITE_SHEET[type - 1];
  if (sheet === undefined || !Number.isInteger(frame) || frame < 1 || frame > sheet.frames) {
    return null;
  }

  return {atlas: FALLBACK_SPRITES, x: (frame - 1) * SPRITE_CELL, y: (type - 1) * SPRITE_CELL, width: sheet.width,
          height: sheet.width};
}

// The art generated from the 16 px sheets: every tile id's ground from images/tiles.png, with no shadow and no
// objects, and every sprite frame from images/sprites.png. Its atlases are the sheets the page has loaded, under
// FALLBACK_TILES and FALLBACK_SPRITES. It has no car's art: a car with none is drawn in its flat colour.
export function fallbackManifest(): Pick<RenderManifest, "tiles" | "sprites" | "cars"> {
  const tiles = new Map<number, TileArt>();
  for (let id = 0; id < TILE_COUNT; id++) {
    const origin = tileImageOrigin(id);
    tiles.set(id, {
      ground: {atlas: FALLBACK_TILES, x: origin.x, y: origin.y, width: FALLBACK_TILE_PIXELS, height: FALLBACK_TILE_PIXELS},
      shadow: null,
      objects: null,
      grass: null,
    });
  }

  const sprites = new Map<string, AtlasRect>();
  SPRITE_SHEET.forEach(({frames}, row) => {
    for (let frame = 1; frame <= frames; frame++) {
      sprites.set(spriteKey(row + 1, frame), fallbackSpriteRect(row + 1, frame)!);
    }
  });

  return {tiles, sprites, cars: new Map()};
}

// Reading a manifest's JSON. Each check throws naming where in the file it failed, so a broken manifest from the
// atlas build is refused at load rather than drawn wrong.

type Json = Record<string, unknown>;

function fail(where: string, problem: string): never {
  throw new Error(`Render manifest: ${where} ${problem}`);
}

function object(value: unknown, where: string, keys: readonly string[], optional: readonly string[] = []): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(where, "is not an object");
  }

  const json = value as Json;
  const unknown = Object.keys(json).filter((key) => !keys.includes(key) && !optional.includes(key));
  if (unknown.length > 0) {
    fail(where, `has unknown keys: ${unknown.join(", ")}`);
  }
  const missing = keys.filter((key) => !(key in json));
  if (missing.length > 0) {
    fail(where, `lacks ${missing.join(", ")}`);
  }

  return json;
}

function wholeNumber(value: unknown, where: string, min: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    fail(where, `is not a whole number of at least ${min}`);
  }

  return value;
}

// A key of the manifest's tiles or sprites, which JSON writes as a string: a whole number from min to below bound
function numberKey(key: string, where: string, min: number, bound: number): number {
  const value = Number(key);
  if (String(value) !== key || !Number.isInteger(value) || value < min || value >= bound) {
    fail(where, `is not a whole number from ${min} to ${bound - 1}`);
  }

  return value;
}

function atlasRect(value: unknown, where: string, atlases: ReadonlyMap<string, string>,
                   extra: readonly string[] = []): AtlasRect & Json {
  const json = object(value, where, ["atlas", "x", "y", "width", "height", ...extra]);
  if (typeof json.atlas !== "string" || !atlases.has(json.atlas)) {
    fail(`${where}.atlas`, "names no atlas of the manifest's");
  }

  return {
    ...json,
    atlas: json.atlas,
    x: wholeNumber(json.x, `${where}.x`, 0),
    y: wholeNumber(json.y, `${where}.y`, 0),
    width: wholeNumber(json.width, `${where}.width`, 1),
    height: wholeNumber(json.height, `${where}.height`, 1),
  };
}

function shadowRect(value: unknown, where: string, atlases: ReadonlyMap<string, string>): ShadowRect {
  const {atlas, x, y, width, height, reach} = atlasRect(value, where, atlases, ["reach"]);
  const sides = object(reach, `${where}.reach`, ["left", "top", "right", "bottom"]);

  return {
    atlas, x, y, width, height,
    reach: {
      left: wholeNumber(sides.left, `${where}.reach.left`, 0),
      top: wholeNumber(sides.top, `${where}.reach.top`, 0),
      right: wholeNumber(sides.right, `${where}.reach.right`, 0),
      bottom: wholeNumber(sides.bottom, `${where}.reach.bottom`, 0),
    },
  };
}

function plainRect(value: unknown, where: string, atlases: ReadonlyMap<string, string>): AtlasRect {
  const {atlas, x, y, width, height} = atlasRect(value, where, atlases);
  return {atlas, x, y, width, height};
}

function finiteNumber(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(where, "is not a number");
  }

  return value;
}

function positiveNumber(value: unknown, where: string): number {
  const number = finiteNumber(value, where);
  if (number <= 0) {
    fail(where, "is not more than 0");
  }

  return number;
}

// A list of exactly `length` numbers
function numbers(value: unknown, where: string, length: number): number[] {
  if (!Array.isArray(value) || value.length !== length) {
    fail(where, `is not a list of ${length} numbers`);
  }

  return value.map((item, i) => finiteNumber(item, `${where}[${i}]`));
}

function list(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(where, "is not a list of at least one");
  }

  return value;
}

// A hash's seed: a whole number below 2 ** 32
function seed(value: unknown, where: string): number {
  const number = wholeNumber(value, where, 0);
  if (number >= 2 ** 32) {
    fail(where, "is past 2 ** 32 - 1");
  }

  return number;
}

// How much of a tile's ground lets the world grass through
function grassThrough(value: unknown, where: string): GrassThrough {
  if (value !== "all" && value !== "part") {
    fail(where, "is neither all nor part");
  }

  return value;
}

function octave(value: unknown, where: string, turned: false): NoiseOctave;
function octave(value: unknown, where: string, turned: true): TurnedOctave;
function octave(value: unknown, where: string, turned: boolean): NoiseOctave | TurnedOctave {
  const json = object(value, where, ["cell", "seed", "weight", ...(turned ? ["turn"] : [])]);
  const parsed = {cell: positiveNumber(json.cell, `${where}.cell`), seed: seed(json.seed, `${where}.seed`),
                  weight: finiteNumber(json.weight, `${where}.weight`)};
  if (!turned) {
    return parsed;
  }

  const [cos, sin] = numbers(json.turn, `${where}.turn`, 2);
  return {...parsed, turn: [cos, sin]};
}

// The grass section: its constants, and each set's tiles, colours ** 4 of them, all in one atlas
function grassArt(value: unknown, atlases: ReadonlyMap<string, string>): GrassArt {
  const json = object(value, "grass", ["colours", "corners", "mask", "tint", "texelsPerTile", "sets"]);
  const colours = wholeNumber(json.colours, "grass.colours", 1);
  const corners = object(json.corners, "grass.corners", ["seed"]);
  const mask = object(json.mask, "grass.mask", ["octaves", "gradients", "centre", "width"]);
  const gradients = list(mask.gradients, "grass.mask.gradients");
  if (gradients.length !== 16) {
    fail("grass.mask.gradients", "is not 16 directions");
  }
  const tint = object(json.tint, "grass.tint", ["octaves", "brightness", "warmth", "warm"]);
  const [r, g, b] = numbers(tint.warm, "grass.tint.warm", 3);
  const constants: GrassConstants = {
    colours,
    corners: {seed: seed(corners.seed, "grass.corners.seed")},
    mask: {
      octaves: list(mask.octaves, "grass.mask.octaves").map((o, i) => octave(o, `grass.mask.octaves[${i}]`, true)),
      gradients: gradients.map((direction, i) => {
        const [x, y] = numbers(direction, `grass.mask.gradients[${i}]`, 2);
        return [x, y] as const;
      }),
      centre: finiteNumber(mask.centre, "grass.mask.centre"),
      width: positiveNumber(mask.width, "grass.mask.width"),
    },
    tint: {
      octaves: list(tint.octaves, "grass.tint.octaves").map((o, i) => octave(o, `grass.tint.octaves[${i}]`, false)),
      brightness: finiteNumber(tint.brightness, "grass.tint.brightness"),
      warmth: finiteNumber(tint.warmth, "grass.tint.warmth"),
      warm: [r, g, b],
    },
    texelsPerTile: wholeNumber(json.texelsPerTile, "grass.texelsPerTile", 1),
  };

  const sets = object(json.sets, "grass.sets", ["lush", "straw"]);
  const set = (name: string): GrassSet => {
    const where = `grass.sets.${name}`;
    const setJson = object(sets[name], where, ["mean", "tiles"]);
    const tiles = list(setJson.tiles, `${where}.tiles`).map((rect, i) => plainRect(rect, `${where}.tiles[${i}]`,
                                                                                  atlases));
    if (tiles.length !== colours ** 4) {
      fail(`${where}.tiles`, `is not ${colours ** 4} tiles, colours ** 4`);
    }
    const [red, green, blue] = numbers(setJson.mean, `${where}.mean`, 3);
    return {tiles, mean: [red, green, blue]};
  };
  const lush = set("lush");
  const straw = set("straw");
  const atlas = lush.tiles[0].atlas;
  if ([...lush.tiles, ...straw.tiles].some((rect) => rect.atlas !== atlas)) {
    fail("grass.sets", "are not all in one atlas");
  }
  // One size, so a frame samples every grass tile at one mip level
  const texels = lush.tiles[0].width;
  if ([...lush.tiles, ...straw.tiles].some((rect) => rect.width !== texels || rect.height !== texels)) {
    fail("grass.sets", "are not all squares of one size");
  }

  return {constants, atlas, texels, lush, straw};
}

// The manifest a manifest file's JSON holds, or an error naming what is wrong with it
export function parseRenderManifest(value: unknown): RenderManifest {
  const json = object(value, "the manifest", ["version", "atlases", "tiles", "sprites", "cars", "grass"]);
  if (json.version !== 1) {
    fail("version", "is not 1");
  }

  const atlasJson = object(json.atlases, "atlases", Object.keys(json.atlases ?? {}));
  const atlases = new Map<string, string>();
  for (const [name, path] of Object.entries(atlasJson)) {
    if (name.startsWith(RESERVED_ATLAS_PREFIX)) {
      fail(`atlases.${name}`, `takes a name starting ${RESERVED_ATLAS_PREFIX}, which the client keeps for its own`);
    }
    if (typeof path !== "string" || path === "") {
      fail(`atlases.${name}`, "is not an image's path");
    }
    atlases.set(name, path);
  }

  const tileJson = object(json.tiles, "tiles", Object.keys(json.tiles ?? {}));
  const tiles = new Map<number, TileArt>();
  for (const [key, entry] of Object.entries(tileJson)) {
    const where = `tiles.${key}`;
    const id = numberKey(key, where, 0, TILE_COUNT);
    const layers = object(entry, where, ["ground"], ["shadow", "objects", "grass"]);
    tiles.set(id, {
      ground: plainRect(layers.ground, `${where}.ground`, atlases),
      shadow: "shadow" in layers ? shadowRect(layers.shadow, `${where}.shadow`, atlases) : null,
      objects: "objects" in layers ? plainRect(layers.objects, `${where}.objects`, atlases) : null,
      grass: "grass" in layers ? grassThrough(layers.grass, `${where}.grass`) : null,
    });
  }

  const spriteJson = object(json.sprites, "sprites", Object.keys(json.sprites ?? {}));
  const sprites = new Map<string, AtlasRect>();
  for (const [typeKey, frameEntries] of Object.entries(spriteJson)) {
    const type = numberKey(typeKey, `sprites.${typeKey}`, 1, SPRITE_SHEET.length + 1);
    const frameJson = object(frameEntries, `sprites.${typeKey}`, Object.keys(frameEntries ?? {}));
    for (const [frameKey, entry] of Object.entries(frameJson)) {
      const where = `sprites.${typeKey}.${frameKey}`;
      const frame = numberKey(frameKey, where, 1, SPRITE_SHEET[type - 1].frames + 1);
      sprites.set(spriteKey(type, frame), plainRect(entry, where, atlases));
    }
  }

  // Each colour the client knows, and in it each way a car faces, any of them left out
  const cars = new Map<string, AtlasRect>();
  const colourJson = object(json.cars, "cars", [], CAR_COLOURS.map(({name}) => name));
  for (const [colour, ways] of Object.entries(colourJson)) {
    const wayJson = object(ways, `cars.${colour}`, [], CAR_DIRECTIONS);
    for (const [way, entry] of Object.entries(wayJson)) {
      cars.set(carKey(colour, way as CarDirection), plainRect(entry, `cars.${colour}.${way}`, atlases));
    }
  }

  return {atlases, tiles, sprites, cars, grass: grassArt(json.grass, atlases)};
}

// Fails naming each rectangle that runs past its atlas, given each atlas's size in pixels
export function checkRectsInAtlases(manifest: Omit<RenderManifest, "atlases">,
                                    sizes: ReadonlyMap<string, {width: number, height: number}>): void {
  const outside: string[] = [];
  const check = (rect: AtlasRect, where: string) => {
    const size = sizes.get(rect.atlas);
    if (size === undefined || rect.x + rect.width > size.width || rect.y + rect.height > size.height) {
      outside.push(`${where} (${rect.atlas})`);
    }
  };

  manifest.tiles.forEach((art, id) => {
    check(art.ground, `tile ${id} ground`);
    if (art.shadow !== null) {
      check(art.shadow, `tile ${id} shadow`);
    }
    if (art.objects !== null) {
      check(art.objects, `tile ${id} objects`);
    }
  });
  manifest.sprites.forEach((rect, key) => check(rect, `sprite ${key}`));
  manifest.cars.forEach((rect, key) => check(rect, `car ${key}`));
  manifest.grass.lush.tiles.forEach((rect, i) => check(rect, `lush grass ${i}`));
  manifest.grass.straw.tiles.forEach((rect, i) => check(rect, `straw grass ${i}`));

  if (outside.length > 0) {
    throw new Error(`Render manifest: rectangles run past their atlas: ${outside.join(", ")}`);
  }
}

// Fails naming each atlas, given each one's size in pixels, wider or higher than the largest texture the browser draws
export function checkAtlasSizes(sizes: ReadonlyMap<string, {width: number, height: number}>, limit: number): void {
  const tooBig: string[] = [];
  sizes.forEach(({width, height}, name) => {
    if (width > limit || height > limit) {
      tooBig.push(`${name} is ${width} by ${height}`);
    }
  });

  if (tooBig.length > 0) {
    throw new Error(`Atlases are past this browser's ${limit} pixels a side: ${tooBig.join(", ")}`);
  }
}

// The art the map draws with: the rendered manifest's, and the fallback's for every tile id and sprite frame it leaves
// out
export class RenderArt {
  // The farthest any shadow reaches past its anchor, on any side: the tiles around the view whose shadows may show in
  // it
  readonly shadowReach: number;

  private readonly fallback = fallbackManifest();

  // The world grass, and what the renderer draws it with
  readonly grass: GrassArt;
  readonly grassDraw: GrassDraw;

  constructor(private readonly rendered: RenderManifest) {
    this.grass = rendered.grass;
    const unit = ([r, g, b]: readonly [number, number, number]) => [r / 255, g / 255, b / 255] as const;
    const {brightness, warmth, warm} = rendered.grass.constants.tint;
    this.grassDraw = {atlas: rendered.grass.atlas, field: GRASS_FIELD, lushMean: unit(rendered.grass.lush.mean),
                      strawMean: unit(rendered.grass.straw.mean), warm, brightness, warmth, fieldTiles: GRASS_MAP};
    let reach = 0;
    rendered.tiles.forEach((art) => {
      if (art.shadow !== null) {
        const {left, top, right, bottom} = art.shadow.reach;
        reach = Math.max(reach, left, top, right, bottom);
      }
    });
    this.shadowReach = reach;
  }

  // The art of a tile id from 0 to below TILE_COUNT
  tile(id: number): TileArt {
    return this.rendered.tiles.get(id) ?? this.fallback.tiles.get(id)!;
  }

  // The art of a sprite's type and frame, or null for one no sheet draws
  sprite(type: number, frame: number): AtlasRect | null {
    const key = spriteKey(type, frame);
    return this.rendered.sprites.get(key) ?? this.fallback.sprites.get(key) ?? null;
  }

  // The art of a car of the colour, by its number in CAR_COLOURS, facing the way given, drawn into the car's square,
  // or null for one the manifest has none for, which is drawn in its flat colour
  car(colour: number, direction: CarDirection): AtlasRect | null {
    return this.rendered.cars.get(carKey(CAR_COLOURS[colour].name, direction)) ?? null;
  }

  // The art of a car of a train facing the way given, drawn into the car's square: the trains' row of the sprite sheet,
  // which no simulation sprite takes and the 16 px sheet always has, its first frame running north or south and its
  // second east or west
  trainCar(direction: CarDirection): AtlasRect {
    const frame = direction === "north" || direction === "south" ? 1 : 2;
    const rect = this.sprite(TRAIN_SPRITE_TYPE, frame);
    if (rect === null) {
      throw new Error(`No art draws the train's frame ${frame}`);
    }
    return rect;
  }
}
