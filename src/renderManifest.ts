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

import type { Rect } from "./rect";
import { tileImageOrigin } from "./tileSet";
import { TILE_COUNT } from "./tileValues";

// The art the map is drawn with: which rectangle of which atlas each tile id draws in each layer, and each sprite type
// and frame. docs/render-assets.md specifies the manifest's file, which the rendered art comes in; a tile id or sprite
// frame the rendered art leaves out is drawn from the fallback manifest, which this module generates from the 16 px
// sheets the game has always drawn with.

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
}

// A manifest: each atlas's image, by name, a path relative to the manifest's own, and the art of each tile id and of
// each sprite, by type and frame, as spriteKey names it
export interface RenderManifest {
  atlases: ReadonlyMap<string, string>;
  tiles: ReadonlyMap<number, TileArt>;
  sprites: ReadonlyMap<string, AtlasRect>;
}

// Atlas names starting with this are the client's own, and a manifest's atlases may not take one: the fallback sheets',
// and the white pixel the overlay's tints are drawn from
const RESERVED_ATLAS_PREFIX = "fallback:";
export const FALLBACK_TILES = `${RESERVED_ATLAS_PREFIX}tiles`;
export const FALLBACK_SPRITES = `${RESERVED_ATLAS_PREFIX}sprites`;
export const WHITE = `${RESERVED_ATLAS_PREFIX}white`;

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
// FALLBACK_TILES and FALLBACK_SPRITES.
export function fallbackManifest(): Pick<RenderManifest, "tiles" | "sprites"> {
  const tiles = new Map<number, TileArt>();
  for (let id = 0; id < TILE_COUNT; id++) {
    const origin = tileImageOrigin(id);
    tiles.set(id, {
      ground: {atlas: FALLBACK_TILES, x: origin.x, y: origin.y, width: FALLBACK_TILE_PIXELS, height: FALLBACK_TILE_PIXELS},
      shadow: null,
      objects: null,
    });
  }

  const sprites = new Map<string, AtlasRect>();
  SPRITE_SHEET.forEach(({frames}, row) => {
    for (let frame = 1; frame <= frames; frame++) {
      sprites.set(spriteKey(row + 1, frame), fallbackSpriteRect(row + 1, frame)!);
    }
  });

  return {tiles, sprites};
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

// The manifest a manifest file's JSON holds, or an error naming what is wrong with it
export function parseRenderManifest(value: unknown): RenderManifest {
  const json = object(value, "the manifest", ["version", "atlases", "tiles", "sprites"]);
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
    const layers = object(entry, where, ["ground"], ["shadow", "objects"]);
    tiles.set(id, {
      ground: plainRect(layers.ground, `${where}.ground`, atlases),
      shadow: "shadow" in layers ? shadowRect(layers.shadow, `${where}.shadow`, atlases) : null,
      objects: "objects" in layers ? plainRect(layers.objects, `${where}.objects`, atlases) : null,
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

  return {atlases, tiles, sprites};
}

// Fails naming each rectangle that runs past its atlas, given each atlas's size in pixels
export function checkRectsInAtlases(manifest: Pick<RenderManifest, "tiles" | "sprites">,
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

  constructor(private readonly rendered: RenderManifest) {
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
}
